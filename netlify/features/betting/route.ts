import { z } from "zod";

import {
  isAwcNotToWinSelfBet,
  isTournamentBetOnOpponent,
  MIN_BET_AMOUNT,
} from "../../../shared/domain/betting";
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
import { buildPredictionBook, calculatePredictionPositionCost } from "./predictionBook";

const exchangeMarketIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9-]+$/);

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("markets") }),
  z.object({ action: z.literal("exchangeMarkets") }),
  z.object({ action: z.literal("bets") }),
  z.object({ action: z.literal("allBets") }),
  z.object({ action: z.literal("suggestions") }),
  z.object({ action: z.literal("exchangeMarket"), marketId: exchangeMarketIdSchema }),
  z.object({
    action: z.literal("placeExchangeOrder"),
    marketId: exchangeMarketIdSchema,
    outcome: z.enum(["yes", "no"]),
    side: z.enum(["buy", "sell"]),
    priceCents: z.number().int().min(1).max(99),
    quantity: z.number().int().min(1).max(10_000),
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
    quantity: z.number().int().min(1).max(10_000),
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
    vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
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
    input.action === "markets" ||
      input.action === "exchangeMarkets" ||
      input.action === "allBets" ||
      input.action === "suggestions" ||
      input.action === "exchangeMarket",
  );
  const supabase = createServerSupabase("Tournament betting service");

  if (input.action === "exchangeMarkets") {
    const { data, error } = await supabase
      .from("prediction_markets")
      .select(
        "id,group_id,group_path,group_title,group_description,group_order,display_name,country_code,starting_chance,display_order",
      )
      .not("group_id", "is", null)
      .order("group_order", { ascending: true })
      .order("display_order", { ascending: true });
    if (error) throw new Error(`Unable to load prediction market catalog: ${error.message}`);
    return identityResponse(identity, 200, { result: data ?? [] });
  }

  if (input.action === "exchangeMarket") {
    const [marketResult, ordersResult, fillsResult] = await Promise.all([
      supabase
        .from("prediction_markets")
        .select(
          "id,question,resolution_rules,resolution_source_url,closes_at,status,outcome,settlement_price_cents,settlement_reference_fill_id,resolved_at,sportsbook_volume_coins",
        )
        .eq("id", input.marketId)
        .maybeSingle(),
      supabase
        .from("prediction_orders")
        .select(
          "id,username,outcome,side,price_cents,quantity,filled_quantity,remaining_quantity,status,created_at,updated_at",
        )
        .eq("market_id", input.marketId)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("prediction_fills")
        .select("id,outcome,price_cents,quantity,buyer_username,seller_username,created_at")
        .eq("market_id", input.marketId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(100),
    ]);
    if (marketResult.error)
      throw new Error(`Unable to load prediction market: ${marketResult.error.message}`);
    if (!marketResult.data) throw new HttpError(404, "That prediction market does not exist.");
    if (ordersResult.error)
      throw new Error(`Unable to load prediction orders: ${ordersResult.error.message}`);
    if (fillsResult.error)
      throw new Error(`Unable to load prediction fills: ${fillsResult.error.message}`);

    const username = identity?.username ?? null;
    const orders = ordersResult.data ?? [];
    const book = buildPredictionBook(orders);

    let positions: unknown[] = [];
    if (username) {
      const [positionsResult, positionFillsResult] = await Promise.all([
        supabase
          .from("prediction_positions")
          .select("outcome,quantity,reserved_quantity,updated_at")
          .eq("market_id", input.marketId)
          .eq("username", username),
        supabase
          .from("prediction_fills")
          .select(
            "id,outcome,price_cents,quantity,buyer_username,seller_username,pair_key,created_at",
          )
          .eq("market_id", input.marketId)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(1000),
      ]);
      if (positionsResult.error)
        throw new Error(`Unable to load prediction positions: ${positionsResult.error.message}`);
      if (positionFillsResult.error)
        throw new Error(
          `Unable to load prediction position history: ${positionFillsResult.error.message}`,
        );
      const positionCosts = calculatePredictionPositionCost(
        positionFillsResult.data ?? [],
        username,
      );
      positions = (positionsResult.data ?? []).map((position) => {
        const cost = positionCosts[position.outcome as "yes" | "no"];
        return {
          ...position,
          average_price_cents: cost.quantity === position.quantity ? cost.averagePriceCents : null,
        };
      });
    }

    return identityResponse(identity, 200, {
      result: {
        market: marketResult.data,
        book,
        fills: fillsResult.data ?? [],
        positions,
        orders: username ? orders.filter((order) => order.username === username) : [],
      },
    });
  }

  if (input.action === "markets") {
    const { data, error } = await supabase
      .from("tournament_betting_markets")
      .select(marketColumns)
      .in("tournament_id", ["awc2026", "lichess-ban-2026"])
      .order("category_order", { ascending: true })
      .order("round_order", { ascending: true });
    if (error) throw new Error(`Unable to load betting markets: ${error.message}`);
    return identityResponse(identity, 200, { result: data });
  }

  if (input.action === "allBets") {
    const { data, error } = await supabase
      .from("tournament_bets")
      .select(betColumns)
      .order("placed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(200);
    if (error) throw new Error(`Unable to load all tournament bets: ${error.message}`);
    return identityResponse(identity, 200, { result: data });
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
      if (/closed/i.test(error.message)) throw new HttpError(409, "This market is closed.");
      throw new Error(`Unable to place prediction order: ${error.message}`);
    }
    return identityResponse(identity, 200, { result: data });
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
    return identityResponse(identity, 200, { result: data });
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
      if (/closed/i.test(error.message)) throw new HttpError(409, "This market is closed.");
      throw new Error(`Unable to update prediction order: ${error.message}`);
    }
    return identityResponse(identity, 200, { result: data });
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
    if (/exceeds 50 percent of net worth/i.test(error.message)) {
      throw new HttpError(
        409,
        "One position can’t exceed 50% of your net worth, including existing bets on that outcome.",
      );
    }
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
    if (/coin economy ban active/i.test(error.message)) {
      throw new HttpError(403, "Your Atomic Coin access is currently suspended.");
    }
    throw new Error(`Unable to place tournament bet: ${error.message}`);
  }
  return identityResponse(identity, 200, { result: data });
};
