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
};
export type PredictionPositionCredit = {
  outcome: PredictionOutcome;
  quantity: number;
  price_cents: number;
  credited_at: string;
};
export type PredictionPositionNetting = { id: number; quantity: number; created_at: string };

export const isPredictionPairRedemption = (fill: PredictionPositionFill): boolean =>
  fill.pair_key !== null && fill.seller_username !== null;

// Replay the actual redemptions, rather than pretending that historical opposite buys
// were netted before the database supported netting. That can erase shares sold later.
export const replayPredictionPosition = ({
  username,
  fills,
  credits = [],
  nettings = [],
}: {
  username: string;
  fills: readonly PredictionPositionFill[];
  credits?: readonly PredictionPositionCredit[];
  nettings?: readonly PredictionPositionNetting[];
}) => {
  const owner = username.toLowerCase();
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
  const buy = (outcome: PredictionOutcome, quantity: number, price: number) => {
    positions[outcome].quantity += quantity;
    positions[outcome].costCents += quantity * price;
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
      closed.costCents += remove("yes", net.quantity) + remove("no", net.quantity);
      closed.proceedsCents += net.quantity * 100;
      closed.quantity += net.quantity * 2;
      group.index++;
    }
  };
  for (const event of events) {
    updatedAt = event.time;
    if (event.kind === "credit")
      buy(event.value.outcome, event.value.quantity, event.value.price_cents);
    else if (event.kind === "fill") {
      const fill = event.value;
      if (fill.buyer_username.toLowerCase() === owner && !isPredictionPairRedemption(fill))
        buy(fill.outcome, fill.quantity, fill.price_cents);
      if (fill.seller_username?.toLowerCase() === owner) {
        closed.costCents += remove(fill.outcome, fill.quantity);
        closed.proceedsCents += fill.price_cents * fill.quantity;
        closed.quantity += fill.quantity;
        lastOutcome = fill.outcome;
      }
    }
    // A single order can fill at several prices in one transaction. Its rows share
    // a timestamp; redeem each recorded pair as soon as that fill supplies it.
    redeemAvailable(event.time);
    const group = pendingNettings.get(event.time);
    if (event.kind === "net" && group && group.index !== group.rows.length)
      throw new Error(`Prediction history is missing contracts for a recorded redemption.`);
  }
  return { positions, closed, lastOutcome, updatedAt };
};
