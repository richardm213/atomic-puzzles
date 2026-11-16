import type { PredictionOutcome } from "./betting";

export type PredictionPositionFill = {
  id: number;
  outcome: PredictionOutcome;
  price_cents: number;
  quantity: number;
  buyer_username: string;
  seller_username: string | null;
  pair_key: string | null;
  created_at: string;
  maker_order_id?: number;
  taker_order_id?: number;
};
export type PredictionPositionCredit = {
  outcome: PredictionOutcome;
  quantity: number;
  price_cents: number;
  credited_at: string;
  fee_coins?: number;
  cost_coins?: number;
};
export type PredictionPositionNetting = { id: number; quantity: number; created_at: string };
export type PredictionPositionEvent = {
  id: string;
  createdAt: string;
  action: "buy" | "sell";
  outcome: PredictionOutcome | null;
  averagePriceCents: number;
  quantity: number;
  pnlChange: number;
};

export const isPredictionPairRedemption = (fill: PredictionPositionFill): boolean =>
  fill.pair_key !== null && fill.seller_username !== null;

export const predictionTradingFee = (receipt: {
  reason: string;
  amount: number;
  metadata: { fee?: unknown } | null;
}): number =>
  receipt.reason === "prediction_trade_fee"
    ? -receipt.amount
    : ["prediction_order_reserve", "prediction_trade_credit"].includes(receipt.reason) &&
        typeof receipt.metadata?.fee === "number"
      ? receipt.metadata.fee
      : 0;

// Replay the actual redemptions, rather than pretending that historical opposite buys
// were netted before the database supported netting. That can erase shares sold later.
export const replayPredictionPosition = ({
  username,
  fills,
  credits = [],
  nettings = [],
  onTransaction,
  receipts = [],
}: {
  username: string;
  fills: readonly PredictionPositionFill[];
  credits?: readonly PredictionPositionCredit[];
  nettings?: readonly PredictionPositionNetting[];
  onTransaction?: (event: PredictionPositionEvent) => void;
  receipts?: readonly {
    reason: string;
    amount: number;
    metadata: Record<string, unknown> | null;
  }[];
}) => {
  const transactions: PredictionPositionEvent[] = [];
  const owner = username.toLowerCase();
  const feesByOrder = new Map<number, number>();
  let totalTradeFees = 0;
  for (const receipt of receipts) {
    if (receipt.metadata?.positionCreditId !== undefined) continue; // Credit cost includes its fee.
    const fee = predictionTradingFee(receipt);
    totalTradeFees += fee;
    const orderId = receipt.metadata?.orderId;
    if (typeof orderId === "number")
      feesByOrder.set(orderId, (feesByOrder.get(orderId) ?? 0) + fee);
  }
  const weights = new Map<number, number>();
  for (const fill of fills) {
    if (
      fill.taker_order_id === undefined ||
      !(
        fill.seller_username?.toLowerCase() === owner ||
        (fill.buyer_username.toLowerCase() === owner && !isPredictionPairRedemption(fill))
      )
    )
      continue;
    weights.set(
      fill.taker_order_id,
      (weights.get(fill.taker_order_id) ?? 0) + fill.quantity * fill.price_cents,
    );
  }
  let allocatedFees = 0;
  const positions = { yes: { quantity: 0, costCents: 0 }, no: { quantity: 0, costCents: 0 } };
  const closed = { quantity: 0, costCents: 0, proceedsCents: 0 };
  let lastOutcome: PredictionOutcome = "yes";
  let updatedAt = new Date(0).toISOString();
  type Event = { time: string; priority: number; id: number } & (
    | { kind: "credit"; value: PredictionPositionCredit }
    | { kind: "fill"; value: PredictionPositionFill }
    | { kind: "net"; value: PredictionPositionNetting }
  );
  const events: Event[] = [
    ...credits.map((value, id): Event => ({
      kind: "credit",
      time: value.credited_at,
      priority: 0,
      id,
      value,
    })),
    ...fills.map((value): Event => ({
      kind: "fill",
      time: value.created_at,
      priority: 1,
      id: value.id,
      value,
    })),
    ...nettings.map((value): Event => ({
      kind: "net",
      time: value.created_at,
      priority: 2,
      id: value.id,
      value,
    })),
  ].sort((a, b) => a.time.localeCompare(b.time) || a.priority - b.priority || a.id - b.id);
  const buy = (
    outcome: PredictionOutcome,
    quantity: number,
    price: number,
    fee = 0,
    cost?: number,
  ) => {
    positions[outcome].quantity += quantity;
    positions[outcome].costCents += cost === undefined ? quantity * price + fee * 100 : cost * 100;
    lastOutcome = outcome;
  };
  const remove = (outcome: PredictionOutcome, quantity: number) => {
    const position = positions[outcome];
    if (quantity - position.quantity > 0.000001)
      throw new Error(`Prediction history oversold ${username}'s ${outcome} contracts.`);
    const cost = position.quantity > 0 ? (position.costCents * quantity) / position.quantity : 0;
    position.quantity = Math.max(0, position.quantity - quantity);
    position.costCents = position.quantity > 0 ? position.costCents - cost : 0;
    return cost;
  };
  const pendingNettings = new Map<string, { rows: PredictionPositionNetting[]; index: number }>();
  for (const net of [...nettings].sort((a, b) => a.id - b.id)) {
    const group = pendingNettings.get(net.created_at) ?? { rows: [], index: 0 };
    group.rows.push(net);
    pendingNettings.set(net.created_at, group);
  }
  const redeemAvailable = (time: string) => {
    const group = pendingNettings.get(time);
    if (!group) return;
    while (group.index < group.rows.length) {
      const net = group.rows[group.index]!;
      if (net.quantity > Math.min(positions.yes.quantity, positions.no.quantity) + 0.000001) break;
      const costs = { yes: remove("yes", net.quantity), no: remove("no", net.quantity) };
      const cost = costs.yes + costs.no;
      closed.costCents += cost;
      closed.proceedsCents += net.quantity * 100;
      closed.quantity += net.quantity * 2;
      group.index++;
      // An opposite purchase closes the existing side at the complementary price.
      // Keep only its excess as a buy, rather than showing a third trading action.
      let remaining = net.quantity;
      for (let index = transactions.length - 1; index >= 0 && remaining > 1e-8; index--) {
        const purchase = transactions[index]!;
        if (purchase.createdAt !== time) break;
        if (purchase.action === "sell" || purchase.quantity === 0 || purchase.outcome === null)
          continue;
        const quantity = Math.min(remaining, purchase.quantity);
        const outcome = purchase.outcome === "yes" ? "no" : "yes";
        purchase.quantity -= quantity;
        remaining -= quantity;
        transactions.splice(index, 0, {
          id: `sell:${net.id}:${index}`,
          createdAt: time,
          action: "sell",
          outcome,
          averagePriceCents: 100 - purchase.averagePriceCents,
          quantity,
          pnlChange: ((net.quantity - cost / 100) * quantity) / net.quantity,
        });
      }
      // Historical migrations closed both already-held sides in one cash payment.
      // Its actual average is 50¢ across the two contracts, not an invented quote
      // for either selection. Preserve those earlier buys and record one sale.
      if (remaining > 1e-8)
        transactions.push({
          id: `sell:${net.id}:both`,
          createdAt: time,
          action: "sell",
          outcome: null,
          averagePriceCents: 50,
          quantity: remaining * 2,
          pnlChange: ((net.quantity - cost / 100) * remaining) / net.quantity,
        });
    }
  };
  for (const event of events) {
    updatedAt = event.time;
    if (event.kind === "credit") {
      buy(
        event.value.outcome,
        event.value.quantity,
        event.value.price_cents,
        event.value.fee_coins ?? 0,
        event.value.cost_coins,
      );
      transactions.push({
        id: `credit:${event.id}`,
        createdAt: event.time,
        action: "buy",
        outcome: event.value.outcome,
        averagePriceCents:
          event.value.cost_coins === undefined
            ? event.value.price_cents + ((event.value.fee_coins ?? 0) * 100) / event.value.quantity
            : (event.value.cost_coins * 100) / event.value.quantity,
        quantity: event.value.quantity,
        pnlChange: 0,
      });
    } else if (event.kind === "fill") {
      const fill = event.value;
      const fee =
        fill.taker_order_id === undefined
          ? 0
          : ((feesByOrder.get(fill.taker_order_id) ?? 0) * fill.quantity * fill.price_cents) /
            (weights.get(fill.taker_order_id) || 1);
      if (fill.buyer_username.toLowerCase() === owner && !isPredictionPairRedemption(fill)) {
        buy(fill.outcome, fill.quantity, fill.price_cents, fee);
        allocatedFees += fee;
        transactions.push({
          id: `buy:${fill.id}`,
          createdAt: event.time,
          action: "buy",
          outcome: fill.outcome,
          averagePriceCents: fill.price_cents + (fee * 100) / fill.quantity,
          quantity: fill.quantity,
          pnlChange: 0,
        });
      }
      if (fill.seller_username?.toLowerCase() === owner) {
        const cost = remove(fill.outcome, fill.quantity);
        closed.costCents += cost;
        closed.proceedsCents += fill.price_cents * fill.quantity - fee * 100;
        allocatedFees += fee;
        closed.quantity += fill.quantity;
        lastOutcome = fill.outcome;
        transactions.push({
          id: `sell:${fill.id}`,
          createdAt: event.time,
          action: "sell",
          outcome: fill.outcome,
          averagePriceCents: fill.price_cents - (fee * 100) / fill.quantity,
          quantity: fill.quantity,
          pnlChange: (fill.price_cents * fill.quantity - cost) / 100 - fee,
        });
      }
    }
    // A single order can fill at several prices in one transaction. Its rows share
    // a timestamp; redeem each recorded pair as soon as that fill supplies it.
    redeemAvailable(event.time);
    const group = pendingNettings.get(event.time);
    if (event.kind === "net" && group && group.index !== group.rows.length)
      throw new Error(`Prediction history is missing contracts for a recorded redemption.`);
  }
  for (const transaction of transactions)
    if (transaction.quantity > 1e-8) onTransaction?.(transaction);
  const remainder = totalTradeFees - allocatedFees;
  return {
    positions,
    closed,
    lastOutcome,
    updatedAt,
    unallocatedFees: Math.abs(remainder) < 1e-8 ? 0 : remainder,
  };
};
