import { z } from "zod";

import { MIN_BET_AMOUNT } from "../../../shared/domain/betting";
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

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("markets") }),
  z.object({ action: z.literal("bets") }),
  z.object({ action: z.literal("allBets") }),
  z.object({ action: z.literal("suggestions") }),
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
  if (["place", "suggest", "voteSuggestion"].includes(input.action)) {
    requireSameOrigin(event.headers, "Cross-site betting requests are not allowed.");
  }
  const identity = await authenticateRequest(
    event.headers,
    input.action === "markets" || input.action === "allBets" || input.action === "suggestions",
  );
  const supabase = createServerSupabase("Tournament betting service");

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
  if (input.selection.toLowerCase() === username) {
    throw new HttpError(400, "You can’t bet on yourself.");
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
    if (/not open/i.test(error.message)) {
      throw new HttpError(409, "Betting has closed for this match.");
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
