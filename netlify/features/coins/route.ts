import { z } from "zod";

import { resolveCanonicalArchiveUsername } from "../../archive/aliases";
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
const coinBanManager = "seaside_tiramisu";
const coinBanUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9_-]+$/i, "Invalid Lichess username.");

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("summary") }),
  z.object({ action: z.literal("history") }),
  z.object({ action: z.literal("leaderboard") }),
  z.object({ action: z.literal("transactions") }),
  z.object({ action: z.literal("claimDaily") }),
  z.object({ action: z.literal("listBans") }),
  z.object({
    action: z.literal("ban"),
    username: coinBanUsernameSchema,
    endsAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(1).max(1000),
  }),
  z.object({
    action: z.literal("revokeBan"),
    id: z.number().int().positive(),
  }),
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
  if (
    input.action !== "summary" &&
    input.action !== "history" &&
    input.action !== "leaderboard" &&
    input.action !== "transactions"
  ) {
    requireSameOrigin(event.headers, "Cross-site coin requests are not allowed.");
  }
  const identity = await authenticateRequest(
    event.headers,
    input.action === "leaderboard" || input.action === "transactions",
  );
  if (input.action === "leaderboard") {
    const supabase = createServerSupabase("Atomic Coins service");
    const { data, error } = await supabase
      .from("coin_accounts")
      .select("username,balance")
      .order("balance", { ascending: false })
      .order("username", { ascending: true });
    if (error) throw new Error(`Unable to load coin rankings: ${error.message}`);
    return identityResponse(identity, 200, { result: data });
  }
  if (input.action === "transactions") {
    const supabase = createServerSupabase("Atomic Coins service");
    const { data, error } = await supabase
      .from("coin_transactions")
      .select("id,username,amount,reason,metadata,created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Unable to load coin transactions: ${error.message}`);
    return identityResponse(identity, 200, { result: data });
  }
  const username = requireUsername(identity, "Log in with Lichess to use Atomic Coins.");
  if (input.action === "listBans" || input.action === "ban" || input.action === "revokeBan") {
    if (username !== coinBanManager) {
      throw new HttpError(403, "Coin economy ban management is restricted.");
    }
    const supabase = createServerSupabase("Atomic Coins service");
    if (input.action === "listBans") {
      const { data, error } = await supabase
        .from("coin_economy_bans")
        .select("id,username,starts_at,ends_at,reason,created_by,created_at,revoked_at,revoked_by")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(200);
      if (error) throw new Error(`Unable to load coin economy bans: ${error.message}`);
      return identityResponse(identity, 200, { bans: data });
    }

    const { data, error } = await (input.action === "ban"
      ? supabase.rpc("create_coin_economy_ban", {
          p_username: input.username,
          p_ends_at: input.endsAt,
          p_reason: input.reason,
          p_created_by: username,
        })
      : supabase.rpc("revoke_coin_economy_ban", {
          p_id: input.id,
          p_revoked_by: username,
        }));
    if (error) {
      if (/must end within the next 365 days/i.test(error.message)) {
        throw new HttpError(400, "Choose an end time within the next 365 days.");
      }
      if (/active coin economy ban not found/i.test(error.message)) {
        throw new HttpError(404, "That active economy ban no longer exists.");
      }
      throw new Error(`Unable to update coin economy bans: ${error.message}`);
    }
    return identityResponse(identity, 200, { ban: data });
  }
  if (input.action === "history") {
    const supabase = createServerSupabase("Atomic Coins service");
    const { data, error } = await supabase
      .from("shop_redemptions")
      .select("id,item_key,cost,status,created_at,fulfilled_at")
      .eq("username", username)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50);
    if (error) throw new Error(`Unable to load purchase history: ${error.message}`);
    return identityResponse(identity, 200, { result: data });
  }
  let canonicalRecipientUsername = input.action === "give" ? input.recipientUsername : "";
  if (input.action === "give") {
    let senderIdentity: string;
    let recipientIdentity: string;
    try {
      [senderIdentity, recipientIdentity] = await Promise.all([
        resolveCanonicalArchiveUsername(username),
        resolveCanonicalArchiveUsername(input.recipientUsername),
      ]);
    } catch {
      throw new HttpError(503, "Coin gifts are temporarily unavailable. Please try again.");
    }
    if (senderIdentity && senderIdentity === recipientIdentity) {
      throw new HttpError(409, "You can’t gift coins between aliases of the same player.");
    }
    canonicalRecipientUsername = recipientIdentity;
  }
  const supabase = createServerSupabase("Atomic Coins service");
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
        p_recipient_username: canonicalRecipientUsername,
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
    const banMatch = error.message.match(/coin economy ban active until ([^\s]+)/i);
    if (banMatch) {
      const end = new Date(banMatch[1]!);
      const endLabel = Number.isNaN(end.getTime()) ? banMatch[1] : end.toLocaleString("en-US");
      throw new HttpError(403, `Your Atomic Coin access is suspended until ${endLabel}.`);
    }
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
