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

const atomicDbOpeningSchema = z.string().trim().min(1).max(1000);
const atomicDbPlayerSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9_-]+$/i, "Invalid Lichess username.");

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("summary") }),
  z.object({ action: z.literal("history") }),
  z.object({ action: z.literal("claimDaily") }),
  z.object({
    action: z.literal("give"),
    recipientUsername: z.string().trim().min(1).max(50),
    amount: z.number().int().min(1).max(100000),
    message: z.string().trim().max(280).optional().default(""),
  }),
  z.object({
    action: z.literal("redeem"),
    itemKey: z.enum([
      "discord_nitro_month",
      "discord_nitro_year",
      "flowers_500",
      "lichess_patron_month",
      "next_prize_tournament_format",
    ]),
  }),
  z
    .object({
      action: z.literal("requestAtomicDbAnalysis"),
      focus: z.enum(["higher_eval", "player_lines"]),
      openings: z.array(atomicDbOpeningSchema).min(1).max(5),
      players: z.array(atomicDbPlayerSchema).max(10).optional().default([]),
    })
    .superRefine((value, context) => {
      if (value.focus === "higher_eval" && value.players.length > 0) {
        context.addIssue({
          code: "custom",
          message: "Player names are only used for database-line requests.",
        });
      }
      if (value.focus === "player_lines" && value.openings.length !== 1) {
        context.addIssue({ code: "custom", message: "Player-line requests require one opening." });
      }
      if (value.focus === "player_lines" && value.players.length === 0) {
        context.addIssue({ code: "custom", message: "Add at least one Lichess username." });
      }
    }),
]);

export const coinsRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, bodySchema, "Invalid coins request.");
  if (input.action !== "summary" && input.action !== "history") {
    requireSameOrigin(event.headers, "Cross-site coin requests are not allowed.");
  }
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in with Lichess to use Atomic Coins.");
  const supabase = createServerSupabase("Atomic Coins service");
  if (input.action === "history") {
    const { data, error } = await supabase
      .from("shop_redemptions")
      .select("id,item_key,cost,status,created_at,fulfilled_at")
      .eq("username", username)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50);
    if (error) throw new Error(`Unable to load redemption history: ${error.message}`);
    return identityResponse(identity, 200, { result: data });
  }
  const rpc = (() => {
    if (input.action === "summary") {
      return supabase.rpc("get_coin_summary", { p_username: username });
    }
    if (input.action === "claimDaily") {
      return supabase.rpc("claim_daily_coins", { p_username: username });
    }
    if (input.action === "give") {
      return supabase.rpc("give_coins", {
        p_sender_username: username,
        p_recipient_username: input.recipientUsername,
        p_amount: input.amount,
        p_message: input.message,
      });
    }
    if (input.action === "requestAtomicDbAnalysis") {
      return supabase.rpc("request_atomicdb_analysis", {
        p_username: username,
        p_focus: input.focus,
        p_openings: input.openings,
        p_players: input.players,
      });
    }
    return supabase.rpc("redeem_shop_item", {
      p_username: username,
      p_item_key: input.itemKey,
    });
  })();
  const { data, error } = await rpc;
  if (error) {
    if (/daily bonus already claimed/i.test(error.message)) {
      throw new HttpError(409, "You already claimed today’s bonus.");
    }
    if (/not enough coins/i.test(error.message)) {
      const redemptionCost =
        input.action === "requestAtomicDbAnalysis"
          ? 200
          : input.action === "redeem" && input.itemKey === "discord_nitro_year"
            ? 4000
            : input.action === "redeem" && input.itemKey === "discord_nitro_month"
              ? 400
              : input.action === "redeem" && input.itemKey === "lichess_patron_month"
                ? 600
                : input.action === "redeem" && input.itemKey === "next_prize_tournament_format"
                  ? 1000
                  : 500;
      throw new HttpError(
        409,
        input.action === "give"
          ? "You don’t have enough coins for this gift."
          : input.action === "requestAtomicDbAnalysis"
            ? "You need 200 coins to request this analysis."
            : `You need ${redemptionCost.toLocaleString()} coins to redeem this item.`,
      );
    }
    if (/recipient must have/i.test(error.message)) {
      throw new HttpError(404, "That player does not have an Atomic Puzzles account.");
    }
    throw new Error(`Unable to update coins: ${error.message}`);
  }
  return identityResponse(identity, 200, { result: data });
};
