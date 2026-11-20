import { z } from "zod";

import { MAX_PREDICTION_ORDER_QUANTITY } from "../../../shared/domain/betting";
import {
  type PredictionPositionCredit,
  type PredictionPositionFill,
  type PredictionPositionNetting,
} from "../../../shared/domain/predictionAccounting";
import {
  buildPredictionPriceHistory,
  predictionHistoryDuration,
  predictionHistoryPeriodSchema,
} from "../../../shared/domain/predictionHistory";
import {
  buildPredictionTraderHistory,
  type PredictionHistoryReceipt,
} from "../../../shared/domain/predictionTraderHistory";
import { voteValueSchema } from "../../../shared/domain/voting";
import {
  loadPredictionPositions,
  predictionFillColumns,
  readPredictionRows,
} from "../../lib/predictionPositions";
import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
  requireUsername,
} from "../../platform/authentication";
import type { FunctionEvent } from "../../platform/defineFunction";
import { createServerSupabase } from "../../platform/environment";
import { HttpError } from "../../platform/errors";
import { parseJsonBody } from "../../platform/validation";
import { buildPredictionBook, type PredictionBookOrder } from "./predictionBook";

const exchangeMarketIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/);

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("bootstrap") }),
  z.object({ action: z.literal("exchangeMarkets") }),
  z.object({ action: z.literal("predictionPositions") }),
  z.object({
    action: z.literal("exchangeTraderHistory"),
    marketId: exchangeMarketIdSchema,
    username: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9_-]+$/)
      .refine((username) => username !== "prediction_admin", "Select a bettor."),
  }),
  z.object({
    action: z.literal("exchangePriceHistory"),
    marketId: exchangeMarketIdSchema,
    period: predictionHistoryPeriodSchema.default("all"),
  }),
  z.object({ action: z.literal("suggestions") }),
  z.object({
    action: z.literal("exchangeMarketBatch"),
    marketIds: z.array(exchangeMarketIdSchema).min(1).max(100),
  }),
  z.object({
    action: z.literal("placeExchangeOrder"),
    requestId: z.uuid(),
    marketId: exchangeMarketIdSchema,
    outcome: z.enum(["yes", "no"]),
    side: z.enum(["buy", "sell"]),
    priceCents: z.number().int().min(1).max(99),
    quantity: z.number().int().min(1).max(MAX_PREDICTION_ORDER_QUANTITY),
  }),
  z.object({
    action: z.literal("cancelExchangeOrder"),
    marketId: exchangeMarketIdSchema,
    orderId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("amendExchangeOrder"),
    marketId: exchangeMarketIdSchema,
    orderId: z.number().int().positive(),
    priceCents: z.number().int().min(1).max(99),
    quantity: z.number().int().min(1).max(MAX_PREDICTION_ORDER_QUANTITY),
  }),
  z.object({
    action: z.literal("suggest"),
    question: z.string().trim().min(8).max(160),
    outcomes: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(60),
          odds: z.number().int().min(1).max(99),
        }),
      )
      .min(2)
      .max(6),
  }),
  z.object({
    action: z.literal("voteSuggestion"),
    suggestionId: z.number().int().positive(),
    vote: voteValueSchema,
  }),
]);

const suggestionColumns = [
  "id",
  "username",
  "question",
  "outcomes",
  "created_at",
  "tournament_market_suggestion_votes(username,vote)",
].join(",");

type SuggestionRow = {
  id: number;
  username: string;
  question: string;
  outcomes: Array<{ label: string; odds: number }>;
  created_at: string;
  tournament_market_suggestion_votes: Array<{ username: string; vote: number }>;
};

const presentSuggestion = (row: SuggestionRow, currentUsername?: string | null) => {
  const votes = row.tournament_market_suggestion_votes ?? [];
  const upvotes = votes.filter((vote) => vote.vote === 1).length;
  const downvotes = votes.filter((vote) => vote.vote === -1).length;
  return {
    id: row.id,
    username: row.username,
    question: row.question,
    outcomes: row.outcomes,
    score: upvotes - downvotes,
    upvotes,
    downvotes,
    userVote: votes.find((vote) => vote.username === currentUsername)?.vote ?? 0,
    createdAt: row.created_at,
  };
};

const exchangeMarketColumns = [
  "id",
  "question",
  "resolution_rules",
  "resolution_source_url",
  "closes_at",
  "status",
  "outcome",
  "settlement_price_cents",
  "settlement_reference_fill_id",
  "resolved_at",
  "sportsbook_volume_coins",
  "exchange_volume_coins",
].join(",");
const exchangeOrderColumns = [
  "id",
  "market_id",
  "username",
  "outcome",
  "side",
  "price_cents",
  "quantity",
  "filled_quantity",
  "remaining_quantity",
  "status",
  "expires_at",
  "created_at",
  "updated_at",
].join(",");

type ExchangeMarketRow = {
  id: string;
  question: string;
  resolution_rules: string;
  resolution_source_url: string;
  closes_at: string;
  status: string;
  outcome: string | null;
  settlement_price_cents: number | null;
  settlement_reference_fill_id: number | null;
  resolved_at: string | null;
  sportsbook_volume_coins: number;
  exchange_volume_coins?: number;
};

type ExchangeOrderRow = PredictionBookOrder & {
  id: number;
  market_id: string;
  username: string;
  quantity: number;
  filled_quantity: number;
  created_at: string;
  updated_at: string;
};

type ExchangeFillRow = PredictionPositionFill & { market_id: string };

const groupByMarketId = <Row extends { market_id: string }>(rows: readonly Row[]) => {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const marketRows = grouped.get(row.market_id);
    if (marketRows) marketRows.push(row);
    else grouped.set(row.market_id, [row]);
  }
  return grouped;
};

const loadPredictionMarketStates = async (
  supabase: ReturnType<typeof createServerSupabase>,
  requestedMarketIds: readonly string[],
  username: string | null,
) => {
  const marketIds = [...new Set(requestedMarketIds)];
  if (!marketIds.length) return [];
  const [marketResult, bookOrdersResult, fillsResult, historyPositions, userOrdersResult] =
    await Promise.all([
      supabase.from("prediction_markets").select(exchangeMarketColumns).in("id", marketIds),
      supabase
        .from("prediction_orders")
        .select(exchangeOrderColumns)
        .in("market_id", marketIds)
        .in("status", ["open", "partial"])
        .order("created_at", { ascending: false })
        .limit(10_000),
      supabase
        .from("prediction_fills")
        .select(predictionFillColumns)
        .in("market_id", marketIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(Math.min(10_000, marketIds.length * 100)),
      username ? loadPredictionPositions(supabase, marketIds, username) : [],
      username
        ? supabase
            .from("prediction_orders")
            .select(exchangeOrderColumns)
            .in("market_id", marketIds)
            .eq("username", username)
            .order("created_at", { ascending: false })
            .limit(5_000)
        : null,
    ]);
  if (marketResult.error)
    throw new Error(`Unable to load prediction markets: ${marketResult.error.message}`);
  if (bookOrdersResult.error)
    throw new Error(`Unable to load prediction orders: ${bookOrdersResult.error.message}`);
  if (fillsResult.error)
    throw new Error(`Unable to load prediction fills: ${fillsResult.error.message}`);
  if (userOrdersResult?.error)
    throw new Error(`Unable to load your prediction orders: ${userOrdersResult.error.message}`);

  const markets = (marketResult.data ?? []) as unknown as ExchangeMarketRow[];
  const bookOrders = (bookOrdersResult.data ?? []) as unknown as ExchangeOrderRow[];
  const recentFills = (fillsResult.data ?? []) as unknown as ExchangeFillRow[];
  const userOrders = (userOrdersResult?.data ?? []) as unknown as ExchangeOrderRow[];
  const bookOrdersByMarket = groupByMarketId(bookOrders);
  const recentFillsByMarket = groupByMarketId(recentFills);
  const positionsByMarket = groupByMarketId(historyPositions);
  const userOrdersByMarket = groupByMarketId(userOrders);
  return markets.map((market) => {
    const marketRecentFills = (recentFillsByMarket.get(market.id) ?? []).slice(0, 100);
    const history = positionsByMarket.get(market.id) ?? [];
    return {
      market,
      book: buildPredictionBook(bookOrdersByMarket.get(market.id) ?? []),
      fills: marketRecentFills,
      positions: history.filter((position) => position.quantity > 0),
      historyPositions: history,
      orders: userOrdersByMarket.get(market.id) ?? [],
    };
  });
};

const presentOrderMutation = async (
  supabase: ReturnType<typeof createServerSupabase>,
  marketId: string,
  username: string,
  result: unknown,
) => {
  const [state] = await loadPredictionMarketStates(supabase, [marketId], username);
  if (!state) throw new Error("Unable to load the updated prediction market.");
  const mutation = result && typeof result === "object" ? result : {};
  return { ...mutation, marketId, state };
};

const loadExchangeMarketCatalog = async (supabase: ReturnType<typeof createServerSupabase>) => {
  const { data, error } = await supabase
    .from("prediction_markets")
    .select(
      "id,group_id,group_path,group_title,group_description,group_order,display_name,country_code,starting_chance,display_order,outcome_yes_label,outcome_no_label,outcome_yes_country_code,outcome_no_country_code",
    )
    .not("group_id", "is", null)
    .order("group_order", { ascending: true })
    .order("display_order", { ascending: true });
  if (error) throw new Error(`Unable to load prediction market catalog: ${error.message}`);
  return data ?? [];
};

export const bettingRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, bodySchema, "Invalid betting request.");
  if (
    [
      "suggest",
      "voteSuggestion",
      "placeExchangeOrder",
      "cancelExchangeOrder",
      "amendExchangeOrder",
    ].includes(input.action)
  ) {
    requireSameOrigin(event.headers, "Cross-site betting requests are not allowed.");
  }
  const identity = await authenticateRequest(
    event.headers,
    input.action === "bootstrap" ||
      input.action === "exchangeMarkets" ||
      input.action === "predictionPositions" ||
      input.action === "suggestions" ||
      input.action === "exchangeMarketBatch" ||
      input.action === "exchangeTraderHistory" ||
      input.action === "exchangePriceHistory",
  );
  const supabase = createServerSupabase("Tournament betting service");

  if (input.action === "exchangeTraderHistory") {
    const { marketId, username } = input;
    const [market, fills, credits, nettings] = await Promise.all([
      supabase
        .from("prediction_markets")
        .select("id,status,resolved_at,outcome,settlement_price_cents")
        .eq("id", marketId)
        .maybeSingle(),
      readPredictionRows(
        () =>
          supabase
            .from("prediction_fills")
            .select(predictionFillColumns)
            .eq("market_id", marketId)
            .or(`buyer_username.eq.${username},seller_username.eq.${username}`)
            .order("id"),
        "trader fills",
      ),
      readPredictionRows(
        () =>
          supabase
            .from("prediction_position_credits")
            .select("id,outcome,quantity,price_cents,credited_at,fee_coins,cost_coins")
            .eq("market_id", marketId)
            .eq("username", username)
            .order("id"),
        "prediction position credits",
      ),
      readPredictionRows(
        () =>
          supabase
            .from("prediction_position_nettings")
            .select("id,quantity,created_at")
            .eq("market_id", marketId)
            .eq("username", username)
            .order("id"),
        "trader redemptions",
      ),
    ]);
    if (market.error) throw new Error(`Unable to load this market: ${market.error.message}`);
    if (!market.data) throw new HttpError(404, "This market is unavailable.");
    const positionCredits = credits as PredictionPositionCredit[];
    const receipts = await readPredictionRows(() => {
      const query = supabase
        .from("coin_transactions")
        .select("id,amount,reason,source_key,metadata,created_at")
        .eq("username", username)
        .in("reason", [
          "prediction_trade_fee",
          "prediction_market_payout",
          "prediction_reconciliation",
          "prediction_order_reserve",
          "prediction_order_refund",
          "prediction_trade_credit",
        ])
        .order("id");
      query.eq("metadata->>marketId", marketId);
      return query;
    }, "trader cash receipts");
    return identityResponse(identity, 200, {
      result: buildPredictionTraderHistory({
        username,
        market: market.data,
        fills: fills as PredictionPositionFill[],
        credits: positionCredits,
        nettings: nettings as PredictionPositionNetting[],
        receipts: receipts as PredictionHistoryReceipt[],
      }),
    });
  }

  if (input.action === "exchangePriceHistory") {
    const result = await supabase
      .from("prediction_markets")
      .select("id,status,resolved_at,outcome,settlement_price_cents")
      .eq("id", input.marketId)
      .maybeSingle();
    if (result.error) throw new Error(`Unable to load this market: ${result.error.message}`);
    if (!result.data) throw new HttpError(404, "This market is unavailable.");
    const market = result.data;
    const end = market.resolved_at ? Date.parse(market.resolved_at) : Date.now();
    const duration = predictionHistoryDuration[input.period];
    const fills = await readPredictionRows(() => {
      let query = supabase
        .from("prediction_fills")
        .select("id,outcome,price_cents,quantity,pair_key,created_at")
        .eq("market_id", input.marketId)
        .lte("created_at", new Date(end).toISOString())
        .order("id");
      if (duration) query = query.gte("created_at", new Date(end - duration).toISOString());
      return query;
    }, "price history");
    return identityResponse(identity, 200, {
      result: buildPredictionPriceHistory(
        fills as ExchangeFillRow[],
        end,
        input.period,
        market.status === "resolved"
          ? {
              time: end,
              price: market.settlement_price_cents ?? (market.outcome === "yes" ? 100 : 0),
            }
          : null,
      ),
    });
  }

  if (input.action === "bootstrap") {
    const [exchangeMarkets, allPredictionPositions] = await Promise.all([
      loadExchangeMarketCatalog(supabase),
      loadPredictionPositions(supabase),
    ]);
    const exchangeMarketStates = await loadPredictionMarketStates(
      supabase,
      exchangeMarkets.map((market) => market.id),
      identity?.username ?? null,
    );
    return identityResponse(identity, 200, {
      result: {
        exchangeMarkets,
        allPredictionPositions,
        exchangeMarketStates,
      },
    });
  }

  if (input.action === "exchangeMarkets") {
    return identityResponse(identity, 200, { result: await loadExchangeMarketCatalog(supabase) });
  }

  if (input.action === "predictionPositions") {
    return identityResponse(identity, 200, { result: await loadPredictionPositions(supabase) });
  }

  if (input.action === "exchangeMarketBatch") {
    const states = await loadPredictionMarketStates(
      supabase,
      input.marketIds,
      identity?.username ?? null,
    );
    return identityResponse(identity, 200, { result: states });
  }

  if (input.action === "suggestions") {
    const { data, error } = await supabase
      .from("tournament_market_suggestions")
      .select(suggestionColumns)
      .eq("tournament_id", "awc2026")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Unable to load market suggestions: ${error.message}`);
    return identityResponse(identity, 200, {
      result: ((data ?? []) as unknown as SuggestionRow[]).map((row) =>
        presentSuggestion(row, identity?.username),
      ),
    });
  }

  const username = requireUsername(identity, "Log in with Lichess to use Atomic Coins for bets.");
  if (input.action === "placeExchangeOrder") {
    const { data, error } = await supabase.rpc("place_prediction_order_once", {
      p_request_id: input.requestId,
      p_username: username,
      p_market_id: input.marketId,
      p_outcome: input.outcome,
      p_side: input.side,
      p_price_cents: input.priceCents,
      p_quantity: input.quantity,
    });
    if (error) {
      if (/request ID.*different parameters/i.test(error.message))
        throw new HttpError(
          409,
          "This order request was already used for a different order.",
          {},
          "order_request_conflict",
        );
      if (/not enough coins/i.test(error.message))
        throw new HttpError(
          409,
          "You don’t have enough available Atomic Coins.",
          {},
          "order_rejected",
        );
      if (/not enough available contracts/i.test(error.message))
        throw new HttpError(
          409,
          "You don’t have enough available contracts to sell.",
          {},
          "order_rejected",
        );
      if (/would cross one of your open orders/i.test(error.message))
        throw new HttpError(
          409,
          "This order would cross one of your existing open orders.",
          {},
          "order_rejected",
        );
      if (/bet against yourself/i.test(error.message))
        throw new HttpError(
          400,
          "You can’t bet against yourself in the AWC champion market.",
          {},
          "order_rejected",
        );
      if (/bet against your current awc opponent/i.test(error.message))
        throw new HttpError(
          400,
          "You can’t bet against your current AWC opponent.",
          {},
          "order_rejected",
        );
      if (/only bet on yourself in your awc round of 16 market/i.test(error.message))
        throw new HttpError(
          400,
          "You can only bet on yourself in your AWC Round of 16 market.",
          {},
          "order_rejected",
        );
      if (/closed/i.test(error.message))
        throw new HttpError(409, "This market is closed.", {}, "order_rejected");
      throw new Error(`Unable to place prediction order: ${error.message}`);
    }
    return identityResponse(identity, 200, {
      result: await presentOrderMutation(supabase, input.marketId, username, data),
    });
  }

  if (input.action === "cancelExchangeOrder") {
    const { data, error } = await supabase.rpc("cancel_prediction_order", {
      p_username: username,
      p_order_id: input.orderId,
    });
    if (error) {
      if (/not found/i.test(error.message))
        throw new HttpError(404, "That open order was not found.");
      if (/not open/i.test(error.message))
        throw new HttpError(409, "That order is no longer open.");
      throw new Error(`Unable to cancel prediction order: ${error.message}`);
    }
    const resultMarketId =
      data && typeof data === "object" && "marketId" in data && typeof data.marketId === "string"
        ? data.marketId
        : input.marketId;
    return identityResponse(identity, 200, {
      result: await presentOrderMutation(supabase, resultMarketId, username, data),
    });
  }

  if (input.action === "amendExchangeOrder") {
    const { data, error } = await supabase.rpc("amend_prediction_order", {
      p_username: username,
      p_market_id: input.marketId,
      p_order_id: input.orderId,
      p_price_cents: input.priceCents,
      p_quantity: input.quantity,
    });
    if (error) {
      if (/not found/i.test(error.message))
        throw new HttpError(404, "That open order was not found.");
      if (/not open/i.test(error.message))
        throw new HttpError(409, "That order is no longer open.");
      if (/not enough coins/i.test(error.message))
        throw new HttpError(409, "You don’t have enough available Atomic Coins.");
      if (/not enough available contracts/i.test(error.message))
        throw new HttpError(409, "You don’t have enough available contracts to sell.");
      if (/would cross one of your open orders/i.test(error.message))
        throw new HttpError(409, "This order would cross one of your existing open orders.");
      if (/only bet on yourself in your awc round of 16 market/i.test(error.message))
        throw new HttpError(400, "You can only bet on yourself in your AWC Round of 16 market.");
      if (/closed/i.test(error.message)) throw new HttpError(409, "This market is closed.");
      throw new Error(`Unable to update prediction order: ${error.message}`);
    }
    return identityResponse(identity, 200, {
      result: await presentOrderMutation(supabase, input.marketId, username, data),
    });
  }

  if (input.action === "suggest") {
    const normalizedLabels = input.outcomes.map((outcome) => outcome.label.toLowerCase());
    if (new Set(normalizedLabels).size !== normalizedLabels.length) {
      throw new HttpError(400, "Use a different name for each outcome.");
    }
    const { data, error } = await supabase
      .from("tournament_market_suggestions")
      .insert({
        tournament_id: "awc2026",
        username,
        question: input.question,
        outcomes: input.outcomes,
      })
      .select("id,username,question,outcomes,created_at")
      .single();
    if (error) throw new Error(`Unable to submit market suggestion: ${error.message}`);
    return identityResponse(identity, 200, {
      result: presentSuggestion({ ...data, tournament_market_suggestion_votes: [] }, username),
    });
  }

  if (input.action === "voteSuggestion") {
    if (input.vote === 0) {
      const { error } = await supabase
        .from("tournament_market_suggestion_votes")
        .delete()
        .eq("suggestion_id", input.suggestionId)
        .eq("username", username);
      if (error) throw new Error(`Unable to remove suggestion vote: ${error.message}`);
    } else {
      const { error } = await supabase.from("tournament_market_suggestion_votes").upsert(
        {
          suggestion_id: input.suggestionId,
          username,
          vote: input.vote,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "suggestion_id,username" },
      );
      if (error) {
        if (/foreign key/i.test(error.message)) {
          throw new HttpError(404, "That market suggestion no longer exists.");
        }
        throw new Error(`Unable to record suggestion vote: ${error.message}`);
      }
    }
    return identityResponse(identity, 200, {
      result: { suggestionId: input.suggestionId, userVote: input.vote },
    });
  }

  throw new HttpError(400, "Unsupported betting action.");
};
