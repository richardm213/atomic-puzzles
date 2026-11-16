import { z } from "zod";

import {
  isAwcNotToWinSelfBet,
  isTournamentBetOnOpponent,
  MAX_PREDICTION_ORDER_QUANTITY,
  MIN_BET_AMOUNT,
} from "../../../shared/domain/betting";
import {
  type PredictionPositionCredit,
  type PredictionPositionFill,
  type PredictionPositionNetting,
  predictionTradingFee,
  replayPredictionPosition,
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
  z.object({ action: z.literal("markets") }),
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
  z.object({ action: z.literal("bets") }),
  z.object({ action: z.literal("allBets") }),
  z.object({ action: z.literal("suggestions") }),
  z.object({
    action: z.literal("exchangeMarketBatch"),
    marketIds: z.array(exchangeMarketIdSchema).min(1).max(100),
  }),
  z.object({
    action: z.literal("placeExchangeOrder"),
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
  z.object({
    action: z.literal("place"),
    marketId: z.string().trim().min(1).max(100),
    selection: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .regex(/^[a-z0-9_-]+$/i, "Invalid player selection."),
    stake: z.number().int().min(MIN_BET_AMOUNT).max(1000),
  }),
]);

const marketColumns = [
  "id",
  "tournament_id",
  "bracket_match_id",
  "round_name",
  "round_order",
  "player_one",
  "player_two",
  "player_one_price",
  "player_two_price",
  "market_kind",
  "category",
  "category_order",
  "label",
  "status",
  "winner",
  "closes_at",
  "updated_at",
  "settled_at",
  "tournament_betting_outcomes(player,price_percent,display_order)",
].join(",");

const betColumns = [
  "id",
  "market_id",
  "username",
  "selection",
  "price_cents",
  "stake",
  "fee",
  "total_cost",
  "potential_payout",
  "status",
  "payout",
  "placed_at",
  "settled_at",
].join(",");

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
const exchangeMarketColumnsWithoutStoredVolume = exchangeMarketColumns
  .split(",")
  .filter((column) => column !== "exchange_volume_coins")
  .join(",");

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

const exchangeFillColumns = [
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
type ExchangePositionRow = {
  market_id: string;
  outcome: "yes" | "no";
  quantity: number;
  reserved_quantity: number;
  updated_at: string;
};
type PublicPredictionPositionRow = ExchangePositionRow & { username: string };
type LegacyPositionCreditRow = {
  market_id: string;
  outcome: "yes" | "no";
  quantity: number;
  price_cents: number;
};
type PublicLegacyPositionCreditRow = LegacyPositionCreditRow & { username: string };

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
  const [initialMarketResult, bookOrdersResult, fillsResult] = await Promise.all([
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
      .select(exchangeFillColumns)
      .in("market_id", marketIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(Math.min(10_000, marketIds.length * 100)),
  ]);
  const marketResult =
    initialMarketResult.error?.message.includes("exchange_volume_coins") === true
      ? await supabase
          .from("prediction_markets")
          .select(exchangeMarketColumnsWithoutStoredVolume)
          .in("id", marketIds)
      : initialMarketResult;
  if (marketResult.error)
    throw new Error(`Unable to load prediction markets: ${marketResult.error.message}`);
  if (bookOrdersResult.error)
    throw new Error(`Unable to load prediction orders: ${bookOrdersResult.error.message}`);
  if (fillsResult.error)
    throw new Error(`Unable to load prediction fills: ${fillsResult.error.message}`);

  const markets = (marketResult.data ?? []) as unknown as ExchangeMarketRow[];
  const bookOrders = (bookOrdersResult.data ?? []) as unknown as ExchangeOrderRow[];
  const recentFills = (fillsResult.data ?? []) as unknown as ExchangeFillRow[];
  let historyPositions: PredictionHistoryRow[] = [];
  let userOrders: ExchangeOrderRow[] = [];
  if (username) {
    const [history, orders] = await Promise.all([
      loadAllPredictionPositions(supabase, marketIds, username),
      supabase
        .from("prediction_orders")
        .select(exchangeOrderColumns)
        .in("market_id", marketIds)
        .eq("username", username)
        .order("created_at", { ascending: false })
        .limit(5_000),
    ]);
    if (orders.error)
      throw new Error(`Unable to load your prediction orders: ${orders.error.message}`);
    historyPositions = history;
    userOrders = (orders.data ?? []) as unknown as ExchangeOrderRow[];
  }
  const bookOrdersByMarket = groupByMarketId(bookOrders);
  const recentFillsByMarket = groupByMarketId(recentFills);
  const positionsByMarket = groupByMarketId(historyPositions);
  const userOrdersByMarket = groupByMarketId(userOrders);
  return markets.map((market) => {
    const marketRecentFills = (recentFillsByMarket.get(market.id) ?? []).slice(0, 100);
    const history = positionsByMarket.get(market.id) ?? [];
    return {
      market:
        market.exchange_volume_coins === undefined
          ? {
              ...market,
              exchange_volume_coins: marketRecentFills.reduce(
                (sum, fill) => sum + (fill.price_cents * fill.quantity) / 100,
                0,
              ),
            }
          : market,
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

const loadTournamentMarkets = async (supabase: ReturnType<typeof createServerSupabase>) => {
  const { data, error } = await supabase
    .from("tournament_betting_markets")
    .select(marketColumns)
    .in("tournament_id", ["awc2026", "lichess-ban-2026"])
    .order("category_order", { ascending: true })
    .order("round_order", { ascending: true });
  if (error) throw new Error(`Unable to load betting markets: ${error.message}`);
  return data ?? [];
};

const loadAllTournamentBets = async (supabase: ReturnType<typeof createServerSupabase>) => {
  const { data, error } = await supabase
    .from("tournament_bets")
    .select(betColumns)
    .order("placed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Unable to load all tournament bets: ${error.message}`);
  return data ?? [];
};

type PredictionHistoryRow = PublicPredictionPositionRow & {
  average_price_cents: number | null;
  closed_cost_coins: number;
  closed_proceeds_coins: number;
  fees_coins: number;
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
const readPredictionRows = async (query: () => RowQuery, label: string) => {
  const rows: unknown[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await query().range(offset, offset + 999);
    if (result.error) throw new Error(`Unable to load ${label}: ${result.error.message}`);
    rows.push(...(result.data ?? []));
    if (!result.data || result.data.length < 1000) return rows;
  }
};

const loadAllPredictionPositions = async (
  supabase: ReturnType<typeof createServerSupabase>,
  marketIds?: readonly string[],
  username?: string,
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
    let query = supabase.from("prediction_fills").select(exchangeFillColumns).order("id");
    if (marketIds) query = query.in("market_id", [...marketIds]);
    if (username) query = query.or(`buyer_username.eq.${username},seller_username.eq.${username}`);
    return query;
  };
  const creditQuery = () => {
    let query = supabase
      .from("prediction_legacy_position_credits")
      .select(
        "market_id,username,outcome,quantity,price_cents,credited_at,...tournament_bets(fee_coins:fee)",
      )
      .order("source_bet_id");
    if (marketIds) query = query.in("market_id", [...marketIds]);
    if (username) query = query.eq("username", username);
    return query;
  };
  const feeQuery = () => {
    let query = supabase
      .from("coin_transactions")
      .select("username,amount,reason,metadata,created_at")
      .in("reason", [
        "prediction_trade_fee",
        "tournament_bet",
        "prediction_order_reserve",
        "prediction_trade_credit",
      ])
      .neq("username", "prediction_admin")
      .order("id");
    if (marketIds) query = query.in("metadata->>marketId", [...marketIds]);
    if (username) query = query.eq("username", username);
    return query;
  };
  const [rawPositions, rawFills, rawCredits, rawNettings, rawFees] = await Promise.all([
    readPredictionRows(positionQuery, "prediction positions"),
    readPredictionRows(fillQuery, "prediction trades"),
    readPredictionRows(creditQuery, "legacy prediction positions"),
    readPredictionRows(nettingQuery, "prediction pair redemptions"),
    readPredictionRows(feeQuery, "prediction trading fees"),
  ]);
  type Owner = {
    marketId: string;
    username: string;
    fills: PredictionPositionFill[];
    credits: PredictionPositionCredit[];
    nettings: PredictionPositionNetting[];
    receipts: { reason: string; amount: number; metadata: Record<string, unknown> }[];
    feeDate: string;
    reserved: Partial<Record<"yes" | "no", number>>;
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
        feeDate: "",
        reserved: {},
      };
      owners.set(key, owner);
    }
    return owner;
  };
  for (const position of rawPositions as PublicPredictionPositionRow[]) {
    const owner = ownerFor(position.market_id, position.username);
    if (owner) owner.reserved[position.outcome] = position.reserved_quantity;
  }
  for (const fill of rawFills as ExchangeFillRow[]) {
    ownerFor(fill.market_id, fill.buyer_username)?.fills.push(fill);
    if (fill.seller_username !== fill.buyer_username)
      ownerFor(fill.market_id, fill.seller_username)?.fills.push(fill);
  }
  for (const credit of rawCredits as (PublicLegacyPositionCreditRow & { credited_at: string })[])
    ownerFor(credit.market_id, credit.username)?.credits.push(credit);
  for (const net of rawNettings as (PredictionPositionNetting & {
    market_id: string;
    username: string;
  })[])
    ownerFor(net.market_id, net.username)?.nettings.push(net);
  for (const fee of rawFees as {
    username: string;
    amount: number;
    reason: string;
    metadata: { marketId?: string; fee?: number };
    created_at: string;
  }[]) {
    if (!fee.metadata.marketId) continue;
    const owner = ownerFor(fee.metadata.marketId, fee.username);
    if (owner) {
      if (fee.reason === "tournament_bet" && owner.credits.length === 0) continue;
      owner.receipts.push(fee);
      if (predictionTradingFee(fee) !== 0 && fee.created_at > owner.feeDate)
        owner.feeDate = fee.created_at;
    }
  }
  const history: PredictionHistoryRow[] = [];
  for (const owner of owners.values()) {
    // A reset removes its trades, not the immutable redemption/fee receipts. Those
    // old redemptions no longer describe holdings in the reopened market.
    const replay = replayPredictionPosition({
      ...owner,
      nettings: owner.fills.length || owner.credits.length ? owner.nettings : [],
    });
    if (replay.positions.yes.quantity > 0.000001 && replay.positions.no.quantity > 0.000001)
      throw new Error("Prediction history contains unnetted holdings.");
    const outcome =
      replay.positions.yes.quantity > 0
        ? "yes"
        : replay.positions.no.quantity > 0
          ? "no"
          : replay.lastOutcome;
    const position = replay.positions[outcome];
    if (position.quantity === 0 && replay.closed.quantity === 0 && replay.unallocatedFees === 0)
      continue;
    history.push({
      market_id: owner.marketId,
      username: owner.username,
      outcome,
      quantity: position.quantity,
      reserved_quantity: Math.min(position.quantity, owner.reserved[outcome] ?? 0),
      updated_at: owner.feeDate > replay.updatedAt ? owner.feeDate : replay.updatedAt,
      average_price_cents:
        position.quantity > 0
          ? position.costCents / position.quantity
          : replay.closed.quantity > 0
            ? replay.closed.costCents / replay.closed.quantity
            : 0,
      closed_cost_coins: replay.closed.costCents / 100,
      closed_proceeds_coins: replay.closed.proceedsCents / 100,
      fees_coins: replay.unallocatedFees,
    });
  }
  return history;
};

export const bettingRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, bodySchema, "Invalid betting request.");
  if (
    [
      "place",
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
      input.action === "markets" ||
      input.action === "exchangeMarkets" ||
      input.action === "predictionPositions" ||
      input.action === "allBets" ||
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
            .select(exchangeFillColumns)
            .eq("market_id", marketId)
            .or(`buyer_username.eq.${username},seller_username.eq.${username}`)
            .order("id"),
        "trader fills",
      ),
      readPredictionRows(
        () =>
          supabase
            .from("prediction_legacy_position_credits")
            .select(
              "source_bet_id,outcome,quantity,price_cents,credited_at,...tournament_bets(fee_coins:fee)",
            )
            .eq("market_id", marketId)
            .eq("username", username)
            .order("source_bet_id"),
        "converted bets",
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
    const legacyCredits = credits as (PredictionPositionCredit & { source_bet_id: number })[];
    const legacySources = legacyCredits.map(
      (credit) => `tournament-bet-payout:${credit.source_bet_id}`,
    );
    const receipts = await readPredictionRows(() => {
      let query = supabase
        .from("coin_transactions")
        .select("id,amount,reason,source_key,metadata,created_at")
        .eq("username", username)
        .in("reason", [
          "prediction_trade_fee",
          "tournament_bet",
          "prediction_market_payout",
          "prediction_reconciliation",
          "tournament_bet_payout",
          "prediction_order_reserve",
          "prediction_order_refund",
          "prediction_trade_credit",
        ])
        .order("id");
      query = legacySources.length
        ? query.or(`metadata->>marketId.eq.${marketId},source_key.in.(${legacySources.join(",")})`)
        : query.eq("metadata->>marketId", marketId);
      return query;
    }, "trader cash receipts");
    return identityResponse(identity, 200, {
      result: buildPredictionTraderHistory({
        username,
        market: market.data,
        fills: fills as PredictionPositionFill[],
        credits: legacyCredits,
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
    const [markets, exchangeMarkets, allBets, allPredictionPositions] = await Promise.all([
      loadTournamentMarkets(supabase),
      loadExchangeMarketCatalog(supabase),
      loadAllTournamentBets(supabase),
      loadAllPredictionPositions(supabase),
    ]);
    const exchangeMarketStates = await loadPredictionMarketStates(
      supabase,
      exchangeMarkets.map((market) => market.id),
      identity?.username ?? null,
    );
    return identityResponse(identity, 200, {
      result: {
        markets,
        exchangeMarkets,
        allBets,
        allPredictionPositions,
        exchangeMarketStates,
      },
    });
  }

  if (input.action === "exchangeMarkets") {
    return identityResponse(identity, 200, { result: await loadExchangeMarketCatalog(supabase) });
  }

  if (input.action === "predictionPositions") {
    return identityResponse(identity, 200, { result: await loadAllPredictionPositions(supabase) });
  }

  if (input.action === "exchangeMarketBatch") {
    const states = await loadPredictionMarketStates(
      supabase,
      input.marketIds,
      identity?.username ?? null,
    );
    return identityResponse(identity, 200, { result: states });
  }

  if (input.action === "markets") {
    return identityResponse(identity, 200, { result: await loadTournamentMarkets(supabase) });
  }

  if (input.action === "allBets") {
    return identityResponse(identity, 200, { result: await loadAllTournamentBets(supabase) });
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
    const { data, error } = await supabase.rpc("place_prediction_order", {
      p_username: username,
      p_market_id: input.marketId,
      p_outcome: input.outcome,
      p_side: input.side,
      p_price_cents: input.priceCents,
      p_quantity: input.quantity,
    });
    if (error) {
      if (/not enough coins/i.test(error.message))
        throw new HttpError(409, "You don’t have enough available Atomic Coins.");
      if (/not enough available contracts/i.test(error.message))
        throw new HttpError(409, "You don’t have enough available contracts to sell.");
      if (/would cross one of your open orders/i.test(error.message))
        throw new HttpError(409, "This order would cross one of your existing open orders.");
      if (/bet against yourself/i.test(error.message))
        throw new HttpError(400, "You can’t bet against yourself in the AWC champion market.");
      if (/bet against your current awc opponent/i.test(error.message))
        throw new HttpError(400, "You can’t bet against your current AWC opponent.");
      if (/only bet on yourself in your awc round of 16 market/i.test(error.message))
        throw new HttpError(400, "You can only bet on yourself in your AWC Round of 16 market.");
      if (/closed/i.test(error.message)) throw new HttpError(409, "This market is closed.");
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

  if (input.action === "bets") {
    const { data, error } = await supabase
      .from("tournament_bets")
      .select(betColumns)
      .eq("username", username)
      .order("placed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(200);
    if (error) throw new Error(`Unable to load tournament bets: ${error.message}`);
    return identityResponse(identity, 200, { result: data });
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

  if (input.marketId.startsWith("lichess-ban-") && input.stake > 200) {
    throw new HttpError(400, "Banned-market bets are limited to 200 coins.");
  }

  if (isAwcNotToWinSelfBet(input.marketId, username, input.selection)) {
    throw new HttpError(400, "You can’t bet on yourself not to win AWC.");
  }

  const { data: selectedMarket, error: selectedMarketError } = await supabase
    .from("tournament_betting_markets")
    .select("market_kind,player_one,player_two")
    .eq("id", input.marketId)
    .maybeSingle();
  if (selectedMarketError) {
    throw new Error(`Unable to validate betting market: ${selectedMarketError.message}`);
  }
  if (
    selectedMarket &&
    isTournamentBetOnOpponent(
      {
        marketKind: selectedMarket.market_kind,
        playerOne: selectedMarket.player_one,
        playerTwo: selectedMarket.player_two,
      },
      username,
      input.selection,
    )
  ) {
    throw new HttpError(400, "You can’t bet on your opponent.");
  }

  const { data, error } = await supabase.rpc("place_tournament_bet", {
    p_username: username,
    p_market_id: input.marketId,
    p_selection: input.selection,
    p_stake: input.stake,
  });
  if (error) {
    if (/not enough coins/i.test(error.message)) {
      throw new HttpError(409, "You don’t have enough coins for this bet and its 2% fee.");
    }
    if (/not open|deadline has passed/i.test(error.message)) {
      throw new HttpError(409, "Betting has closed for this market.");
    }
    if (/not found/i.test(error.message)) {
      throw new HttpError(404, "That betting market no longer exists.");
    }
    if (/between 1 and 1000/i.test(error.message)) {
      throw new HttpError(400, "Enter a bet from 1 to 1,000 coins.");
    }
    throw new Error(`Unable to place tournament bet: ${error.message}`);
  }
  return identityResponse(identity, 200, { result: data });
};
