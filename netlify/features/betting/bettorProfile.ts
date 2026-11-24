import type { SupabaseClient } from "@supabase/supabase-js";

import type { BettorProfile } from "../../../shared/domain/bettorProfile";
import {
  type PredictionPositionCredit,
  type PredictionPositionFill,
  type PredictionPositionNetting,
  predictionTradingReceiptReasons,
} from "../../../shared/domain/predictionAccounting";
import {
  type PredictionHistoryReceipt,
  summarizePredictionTraderHistory,
} from "../../../shared/domain/predictionTraderHistory";
import { predictionFillColumns, readPredictionRows } from "../../lib/predictionPositions";
import { HttpError } from "../../platform/errors";

type MarketRow<T> = T & { market_id: string };
type MarketReceipt = PredictionHistoryReceipt & { metadata: { marketId?: string } | null };

export const traderMarketColumns = "id,status,resolved_at,outcome,settlement_price_cents";

export const loadTraderActivity = async (
  supabase: SupabaseClient,
  username: string,
  marketId?: string,
) => {
  const [fills, credits, nettings, receipts] = await Promise.all([
    readPredictionRows(() => {
      const query = supabase.from("prediction_fills").select(predictionFillColumns);
      if (marketId) query.eq("market_id", marketId);
      return query.or(`buyer_username.eq.${username},seller_username.eq.${username}`).order("id");
    }, "trader fills"),
    readPredictionRows(() => {
      const query = supabase
        .from("prediction_position_credits")
        .select("id,market_id,outcome,quantity,price_cents,credited_at,fee_coins,cost_coins")
        .eq("username", username);
      if (marketId) query.eq("market_id", marketId);
      return query.order("id");
    }, "prediction position credits"),
    readPredictionRows(() => {
      const query = supabase
        .from("prediction_position_nettings")
        .select("id,market_id,quantity,created_at")
        .eq("username", username);
      if (marketId) query.eq("market_id", marketId);
      return query.order("id");
    }, "trader redemptions"),
    readPredictionRows(() => {
      const query = supabase
        .from("coin_transactions")
        .select("id,amount,reason,source_key,metadata,created_at")
        .eq("username", username)
        .in("reason", predictionTradingReceiptReasons);
      if (marketId) query.eq("metadata->>marketId", marketId);
      return query.order("id");
    }, "trader cash receipts"),
  ]);
  return {
    fills: fills as MarketRow<PredictionPositionFill>[],
    credits: credits as MarketRow<PredictionPositionCredit>[],
    nettings: nettings as MarketRow<PredictionPositionNetting>[],
    receipts: receipts as MarketReceipt[],
  };
};

type TraderMarket = Parameters<typeof summarizePredictionTraderHistory>[0]["market"] & {
  id: string;
  question: string;
  group_path: string | null;
  outcome_yes_label: string | null;
  outcome_no_label: string | null;
};
const coinActivityReasons = [
  "puzzle_correct",
  "puzzle_created",
  "shop_redemption",
  "game_analysis",
  "opening_purchase",
  "opening_publish",
] as const;
type CoinActivity = { reason: (typeof coinActivityReasons)[number]; amount: number };
const roundCoins = (amount: number) => Math.round(amount * 1e6) / 1e6;

export const loadBettorProfile = async (
  supabase: SupabaseClient,
  username: string,
): Promise<BettorProfile> => {
  const [ledger, account, coinActivity] = await Promise.all([
    loadTraderActivity(supabase, username),
    supabase.from("coin_accounts").select("balance").eq("username", username).maybeSingle(),
    readPredictionRows(
      () =>
        supabase
          .from("coin_transactions")
          .select("amount,reason")
          .eq("username", username)
          .in("reason", [...coinActivityReasons])
          .order("id"),
      "bettor coin activity",
    ),
  ]);
  if (account.error) throw new Error(`Unable to load bettor balance: ${account.error.message}`);
  const byMarket = new Map<string, typeof ledger>();
  const getMarket = (id: string) => {
    const existing = byMarket.get(id);
    if (existing) return existing;
    const empty: typeof ledger = { fills: [], credits: [], nettings: [], receipts: [] };
    byMarket.set(id, empty);
    return empty;
  };
  for (const fill of ledger.fills) getMarket(fill.market_id).fills.push(fill);
  for (const credit of ledger.credits) getMarket(credit.market_id).credits.push(credit);
  for (const netting of ledger.nettings) getMarket(netting.market_id).nettings.push(netting);
  for (const receipt of ledger.receipts) {
    const id = receipt.metadata?.marketId;
    if (typeof id === "string" && id) getMarket(id).receipts.push(receipt);
  }
  if (!account.data && byMarket.size === 0 && coinActivity.length === 0)
    throw new HttpError(404, "Bettor profile not found.");

  const marketIds = [...byMarket.keys()];
  const markets: BettorProfile["markets"] = {};
  const openPositions: BettorProfile["openPositions"] = [];
  const settledBets: BettorProfile["settledBets"] = [];
  const pnlChangesByDay = new Map<string, number>();
  for (let offset = 0; offset < marketIds.length; offset += 50) {
    const { data, error } = await supabase
      .from("prediction_markets")
      .select(`${traderMarketColumns},question,group_path,outcome_yes_label,outcome_no_label`)
      .in("id", marketIds.slice(offset, offset + 50));
    if (error) throw new Error(`Unable to load bettor markets: ${error.message}`);
    for (const market of (data ?? []) as TraderMarket[]) {
      const summary = summarizePredictionTraderHistory({
        username,
        market,
        ...byMarket.get(market.id)!,
      });
      if (!summary.history.length && !summary.openPositions.length) continue;
      markets[market.id] = {
        title: market.question,
        path: market.group_path,
        yes: market.outcome_yes_label || "Yes",
        no: market.outcome_no_label || "No",
      };
      for (const position of summary.openPositions)
        openPositions.push({ marketId: market.id, ...position });
      const lastEntry = summary.history.at(-1);
      if (lastEntry && (market.status === "resolved" || market.status === "refunded")) {
        const outcomes = new Set(summary.history.map((entry) => entry.outcome));
        outcomes.delete(null);
        settledBets.push({
          marketId: market.id,
          outcome: outcomes.size === 1 ? ([...outcomes][0] ?? null) : null,
          settledAt: market.resolved_at ?? lastEntry.createdAt,
          status: market.status,
          pnl: lastEntry.runningPnl,
        });
      }
      for (const { createdAt, pnlChange } of summary.history) {
        const day = new Date(createdAt).toISOString().slice(0, 10);
        pnlChangesByDay.set(day, (pnlChangesByDay.get(day) ?? 0) + pnlChange);
      }
    }
  }
  settledBets.sort((a, b) => Date.parse(b.settledAt) - Date.parse(a.settledAt));
  openPositions.sort((a, b) => b.cost - a.cost);
  const balance = Number(account.data?.balance ?? 0);
  const openCost = roundCoins(openPositions.reduce((sum, position) => sum + position.cost, 0));
  const earnings = { puzzle_correct: 0, puzzle_created: 0 };
  let spending = 0;
  for (const { reason, amount } of coinActivity as CoinActivity[]) {
    if (reason === "puzzle_correct" || reason === "puzzle_created") {
      earnings[reason] += Math.max(0, Number(amount));
    } else {
      spending += Number(amount);
    }
  }
  let realizedPnl = 0;
  const pnlByDay = [...pnlChangesByDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, change]) => {
      realizedPnl = roundCoins(realizedPnl + change);
      return { day, pnl: realizedPnl };
    });
  return {
    username,
    balance,
    openCost,
    netWorth: roundCoins(balance + openCost),
    realizedPnl,
    puzzleSolveCoins: roundCoins(earnings.puzzle_correct),
    puzzleCreationCoins: roundCoins(earnings.puzzle_created),
    coinsSpent: roundCoins(Math.min(0, spending)),
    markets,
    openPositions,
    pnlByDay,
    settledBets,
  };
};
