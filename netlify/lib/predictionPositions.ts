import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isPredictionMarketRefund,
  type PredictionPositionCredit,
  type PredictionPositionFill,
  type PredictionPositionNetting,
  predictionTradingFee,
  predictionTradingReceiptReasons,
  replayPredictionPosition,
} from "../../shared/domain/predictionAccounting";
import {
  isUnsettledPredictionMarket,
  type PredictionHistoryReceipt,
  type PredictionTraderMarket,
  summarizePredictionTraderHistory,
} from "../../shared/domain/predictionTraderHistory";
import { loadAllPages } from "../../shared/lib/pagination";

export const predictionFillColumns = [
  "id",
  "market_id",
  "outcome",
  "price_cents",
  "quantity",
  "buyer_username",
  "seller_username",
  "pair_key",
  "maker_order_id",
  "taker_order_id",
  "created_at",
].join(",");

type ExchangeFillRow = PredictionPositionFill & { market_id: string };
type PositionRow = {
  market_id: string;
  username: string;
  outcome: "yes" | "no";
  quantity: number;
  reserved_quantity: number;
  updated_at: string;
};
type CreditRow = PredictionPositionCredit & { market_id: string; username: string };

export type PredictionHistoryRow = PositionRow & {
  average_price_cents: number | null;
  remaining_cost_coins: number;
  closed_cost_coins: number;
  closed_proceeds_coins: number;
  fees_coins: number;
  terminal_return_coins: number;
  realized_pnl_coins?: number;
};

type RowQuery = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>;
};

// PostgREST caps each response. Never silently lose older trades or sold-out positions.
export const readPredictionRows = async (query: () => RowQuery, label: string) => {
  return loadAllPages(async (offset, size) => {
    const result = await query().range(offset, offset + size - 1);
    if (result.error) throw new Error(`Unable to load ${label}: ${result.error.message}`);
    return result.data ?? [];
  });
};

export const loadPredictionPositions = async (
  supabase: SupabaseClient,
  marketIds?: readonly string[],
  username?: string,
  {
    verifyHoldings = false,
    realizedPnlMarkets,
  }: {
    verifyHoldings?: boolean;
    realizedPnlMarkets?: ReadonlyMap<string, PredictionTraderMarket>;
  } = {},
): Promise<PredictionHistoryRow[]> => {
  const positionQuery = () => {
    let query = supabase
      .from("prediction_positions")
      .select("market_id,username,outcome,quantity,reserved_quantity,updated_at")
      .gt("quantity", 0)
      .neq("username", "prediction_admin")
      .order("market_id")
      .order("username")
      .order("outcome");
    if (marketIds) query = query.in("market_id", [...marketIds]);
    if (username) query = query.eq("username", username);
    return query;
  };
  const nettingQuery = () => {
    let query = supabase
      .from("prediction_position_nettings")
      .select("id,market_id,username,quantity,created_at")
      .order("id");
    if (marketIds) query = query.in("market_id", [...marketIds]);
    if (username) query = query.eq("username", username);
    return query;
  };
  const fillQuery = () => {
    let query = supabase.from("prediction_fills").select(predictionFillColumns).order("id");
    if (marketIds) query = query.in("market_id", [...marketIds]);
    if (username) query = query.or(`buyer_username.eq.${username},seller_username.eq.${username}`);
    return query;
  };
  const creditQuery = () => {
    let query = supabase
      .from("prediction_position_credits")
      .select("market_id,username,outcome,quantity,price_cents,credited_at,fee_coins,cost_coins")
      .order("id");
    if (marketIds) query = query.in("market_id", [...marketIds]);
    if (username) query = query.eq("username", username);
    return query;
  };
  const receiptQuery = () => {
    let query = supabase
      .from("coin_transactions")
      .select("id,username,amount,reason,source_key,metadata,created_at")
      .in("reason", predictionTradingReceiptReasons)
      .neq("username", "prediction_admin")
      .order("id");
    if (marketIds) query = query.in("metadata->>marketId", [...marketIds]);
    if (username) query = query.eq("username", username);
    return query;
  };
  const [rawPositions, rawFills, rawCredits, rawNettings, rawReceipts] = await Promise.all([
    readPredictionRows(positionQuery, "prediction positions"),
    readPredictionRows(fillQuery, "prediction trades"),
    readPredictionRows(creditQuery, "prediction position credits"),
    readPredictionRows(nettingQuery, "prediction pair redemptions"),
    readPredictionRows(receiptQuery, "prediction coin receipts"),
  ]);
  type Owner = {
    marketId: string;
    username: string;
    fills: PredictionPositionFill[];
    credits: PredictionPositionCredit[];
    nettings: PredictionPositionNetting[];
    receipts: PredictionHistoryReceipt[];
    receiptDate: string;
    terminalReturn: number;
    reserved: Partial<Record<"yes" | "no", number>>;
    held: Record<"yes" | "no", number>;
  };
  const owners = new Map<string, Owner>();
  const ownerFor = (marketId: string, name: string | null): Owner | undefined => {
    const ownerName = name?.toLowerCase();
    if (!ownerName || ownerName === "prediction_admin" || (username && ownerName !== username))
      return undefined;
    const key = `${marketId}:${ownerName}`;
    let owner = owners.get(key);
    if (!owner) {
      owner = {
        marketId,
        username: ownerName,
        fills: [],
        credits: [],
        nettings: [],
        receipts: [],
        receiptDate: "",
        terminalReturn: 0,
        reserved: {},
        held: { yes: 0, no: 0 },
      };
      owners.set(key, owner);
    }
    return owner;
  };
  for (const position of rawPositions as PositionRow[]) {
    const owner = ownerFor(position.market_id, position.username);
    if (owner) {
      owner.reserved[position.outcome] = position.reserved_quantity;
      owner.held[position.outcome] = position.quantity;
    }
  }
  for (const fill of rawFills as ExchangeFillRow[]) {
    ownerFor(fill.market_id, fill.buyer_username)?.fills.push(fill);
    if (fill.seller_username !== fill.buyer_username)
      ownerFor(fill.market_id, fill.seller_username)?.fills.push(fill);
  }
  for (const credit of rawCredits as CreditRow[])
    ownerFor(credit.market_id, credit.username)?.credits.push(credit);
  for (const net of rawNettings as (PredictionPositionNetting & {
    market_id: string;
    username: string;
  })[])
    ownerFor(net.market_id, net.username)?.nettings.push(net);
  for (const receipt of rawReceipts as (PredictionHistoryReceipt & {
    username: string;
    metadata: { marketId?: string; fee?: number; kind?: string } | null;
  })[]) {
    const metadata = receipt.metadata;
    if (!metadata?.marketId) continue;
    const terminal =
      receipt.reason === "prediction_market_payout" ||
      isPredictionMarketRefund(receipt) ||
      (receipt.reason === "prediction_reconciliation" &&
        metadata.kind === "duplicate-legacy-payout");
    const includeHistory = realizedPnlMarkets?.has(metadata.marketId);
    if (!includeHistory && !terminal && predictionTradingFee(receipt) === 0) continue;
    const owner = ownerFor(metadata.marketId, receipt.username);
    if (!owner) continue;
    if (terminal) owner.terminalReturn += receipt.amount;
    if (includeHistory || !terminal) owner.receipts.push(receipt);
    if (receipt.created_at > owner.receiptDate) owner.receiptDate = receipt.created_at;
  }
  const history: PredictionHistoryRow[] = [];
  for (const owner of owners.values()) {
    // A reset removes its trades, not the immutable redemption/fee receipts. Those
    // old redemptions no longer describe holdings in the reopened market.
    const market = realizedPnlMarkets?.get(owner.marketId);
    const summary = market ? summarizePredictionTraderHistory({ ...owner, market }) : undefined;
    const realizedPnl = summary?.history.at(-1)?.runningPnl;
    const replay =
      summary?.replay ??
      replayPredictionPosition({
        ...owner,
        nettings: owner.fills.length || owner.credits.length ? owner.nettings : [],
      });
    // Keep ranking validation strict without failing a completed order when another
    // fill lands between its separate position and trade reads.
    if (
      verifyHoldings &&
      (!market || isUnsettledPredictionMarket(market.status)) &&
      (["yes", "no"] as const).some(
        (outcome) => Math.abs(replay.positions[outcome].quantity - owner.held[outcome]) > 0.000001,
      )
    )
      throw new Error("Prediction position history is incomplete.");
    if (
      (!market || isUnsettledPredictionMarket(market.status)) &&
      replay.positions.yes.quantity > 0.000001 &&
      replay.positions.no.quantity > 0.000001
    )
      throw new Error("Prediction history contains unnetted holdings.");
    const outcome =
      replay.positions.yes.quantity > 0
        ? "yes"
        : replay.positions.no.quantity > 0
          ? "no"
          : replay.lastOutcome;
    const position = replay.positions[outcome];
    if (
      position.quantity === 0 &&
      replay.closed.quantity === 0 &&
      replay.unallocatedFees === 0 &&
      owner.terminalReturn === 0 &&
      !realizedPnl
    )
      continue;
    history.push({
      market_id: owner.marketId,
      username: owner.username,
      outcome,
      quantity: position.quantity,
      reserved_quantity: Math.min(position.quantity, owner.reserved[outcome] ?? 0),
      updated_at: owner.receiptDate > replay.updatedAt ? owner.receiptDate : replay.updatedAt,
      average_price_cents:
        position.quantity > 0
          ? position.costCents / position.quantity
          : replay.closed.quantity > 0
            ? replay.closed.costCents / replay.closed.quantity
            : 0,
      remaining_cost_coins: position.costCents / 100,
      closed_cost_coins: replay.closed.costCents / 100,
      closed_proceeds_coins: replay.closed.proceedsCents / 100,
      fees_coins: replay.unallocatedFees,
      terminal_return_coins: owner.terminalReturn,
      ...(realizedPnl === undefined ? {} : { realized_pnl_coins: realizedPnl }),
    });
  }
  return history;
};
