import type { SupabaseClient } from "@supabase/supabase-js";

type Transaction = { reason: string; amount: number; metadata: Record<string, unknown> | null };
type Market = {
  id: string;
  display_name: string;
  outcome_yes_label: string | null;
  outcome_no_label: string | null;
};
type Order = { id: number; outcome: string; filled_quantity: number };
type Fill = { id: number; outcome: string; quantity: number };
type LegacyMarket = {
  id: string;
  label: string;
  market_kind: string;
  player_one: string;
  player_two: string;
};
type Context = {
  markets: ReadonlyMap<string, Market>;
  orders: ReadonlyMap<number, Order>;
  fills: ReadonlyMap<number, Fill>;
  legacyMarkets: ReadonlyMap<string, LegacyMarket>;
};
const numeric = (value: unknown): number | undefined => {
  const number = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : undefined;
};
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const shares = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

export const describeBettingTransaction = (
  transaction: Transaction,
  context: Context,
): string | undefined => {
  const { reason, amount } = transaction;
  const metadata = transaction.metadata ?? {};
  const marketId = text(metadata.marketId);
  const market = context.markets.get(marketId);
  const legacy = context.legacyMarkets.get(marketId);
  const label =
    market?.display_name ||
    (legacy?.market_kind === "match"
      ? `${legacy.player_one} vs ${legacy.player_two}`
      : legacy?.label) ||
    text(metadata.selection) ||
    text(metadata.winner);
  if (reason === "prediction_liquidity_funding")
    return `${amount < 0 ? "Reduced" : "Funded"} ${label ? `liquidity for ${label}` : "prediction-market liquidity"}`;
  if (!label) return reason === "tournament_bet_refund" ? "Refund for betting limit" : undefined;
  const order = context.orders.get(numeric(metadata.orderId) ?? -1);
  const fill = context.fills.get(numeric(metadata.fillId) ?? -1);
  const outcome = text(metadata.outcome) || fill?.outcome || order?.outcome;
  const outcomeLabel = outcome === "no" ? market?.outcome_no_label : market?.outcome_yes_label;
  const selection = text(metadata.selection) || outcomeLabel || market?.display_name || label;
  const side = outcome === "no" && !outcomeLabel ? "No " : "";
  const quantity = numeric(metadata.quantity) ?? fill?.quantity;
  const trade = (verb: string, count = quantity) =>
    `${verb} ${count === undefined ? "" : `${shares.format(count)} `}${side}shares of ${selection}`;
  if (reason === "prediction_market_payout" || reason === "tournament_bet_payout")
    return `${amount < 0 ? "Payout reversed" : "Payout"} for ${label}`;
  if (reason === "tournament_bet_refund" || reason === "prediction_order_refund")
    return `Refund for ${label}`;
  if (reason === "tournament_bet") {
    if (metadata.reason === "correct_account_limit_to_per_position_limit")
      return `Bet restored for ${label}`;
    // Stake is this purchase's amount; potentialPayout may describe the whole position.
    const stake = numeric(metadata.stake);
    const price = numeric(metadata.priceCents);
    return trade("Bought", stake && price ? (stake * 100) / price : undefined);
  }
  if (reason === "prediction_order_reserve") {
    if (numeric(metadata.completeSets)) return `Funded liquidity for ${label}`;
    const executed =
      metadata.chargeMode === "fill" ||
      (order?.filled_quantity ?? 0) > 0 ||
      (numeric(metadata.fee) ?? 0) > 0;
    return trade(
      executed ? "Bought" : "Reserved coins for",
      metadata.chargeMode === "fill" ? quantity : (numeric(order?.filled_quantity) ?? quantity),
    );
  }
  if (reason === "prediction_trade_credit") {
    if (amount < 0) return `Sale reversed for ${label}`;
    if (numeric(metadata.nettingId))
      return `Sold ${quantity === undefined ? "" : `${shares.format(quantity * 2)} `}shares on ${label}`;
    return trade("Sold");
  }
  if (reason === "prediction_trade_fee") return `Trade fee for ${selection}`;
  if (reason === "prediction_reconciliation") return `Betting correction for ${label}`;
  return undefined;
};

// Resolve only the references on this page, in batches. This also describes receipts
// written before trade/market labels existed, without rewriting financial history.
export const describeCoinTransactions = async <T extends Transaction>(
  supabase: SupabaseClient,
  transactions: T[],
) => {
  const betting = transactions.filter(
    (t) => t.reason.startsWith("prediction_") || t.reason.startsWith("tournament_bet"),
  );
  const metadata = betting.map((t) => t.metadata ?? {});
  const marketIds = [...new Set(metadata.map((m) => text(m.marketId)).filter(Boolean))];
  const orderIds = [
    ...new Set(
      metadata.map((m) => numeric(m.orderId)).filter((id): id is number => id !== undefined),
    ),
  ];
  const fillIds = [
    ...new Set(
      metadata.map((m) => numeric(m.fillId)).filter((id): id is number => id !== undefined),
    ),
  ];
  const read = async <R>(
    table: string,
    columns: string,
    ids: readonly (string | number)[],
  ): Promise<R[]> => {
    if (!ids.length) return [];
    const { data, error } = await supabase.from(table).select(columns).in("id", ids);
    if (error) throw new Error(`Unable to describe coin transactions: ${error.message}`);
    return (data ?? []) as R[];
  };
  const [markets, orders, fills, legacyMarkets] = await Promise.all([
    read<Market>(
      "prediction_markets",
      "id,display_name,outcome_yes_label,outcome_no_label",
      marketIds,
    ),
    read<Order>("prediction_orders", "id,outcome,filled_quantity", orderIds),
    read<Fill>("prediction_fills", "id,outcome,quantity", fillIds),
    read<LegacyMarket>(
      "tournament_betting_markets",
      "id,label,market_kind,player_one,player_two",
      marketIds,
    ),
  ]);
  const context: Context = {
    markets: new Map(markets.map((m) => [m.id, m])),
    orders: new Map(orders.map((o) => [o.id, o])),
    fills: new Map(fills.map((f) => [f.id, f])),
    legacyMarkets: new Map(legacyMarkets.map((m) => [m.id, m])),
  };
  return transactions.map((transaction) => {
    const description = describeBettingTransaction(transaction, context);
    return description ? { ...transaction, description } : transaction;
  });
};
