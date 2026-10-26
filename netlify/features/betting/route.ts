import { z } from "zod";

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
  z.object({
    action: z.literal("place"),
    marketId: z.string().trim().min(1).max(100),
    selection: z
      .string()
      .trim()
      .min(1)
      .max(50)
      .regex(/^[a-z0-9_-]+$/i, "Invalid player selection."),
    stake: z.number().int().min(1).max(1000),
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

export const bettingRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, bodySchema, "Invalid betting request.");
  if (input.action === "place") {
    requireSameOrigin(event.headers, "Cross-site betting requests are not allowed.");
  }
  const identity = await authenticateRequest(
    event.headers,
    input.action === "markets" || input.action === "allBets",
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

  if (input.marketId.startsWith("lichess-ban-") && input.stake > 200) {
    throw new HttpError(400, "Banned-market bets are limited to 200 coins.");
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
        "Your open bets can’t exceed 50% of your net worth, including outstanding bets.",
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
