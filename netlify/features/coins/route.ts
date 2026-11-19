import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  COIN_TRANSACTION_REASONS,
  REDEEMABLE_SHOP_ITEM_KEYS,
  SHOP_ITEM_COSTS,
  SHOP_REOPENS_AT,
} from "../../../shared/domain/coins";
import { resolveCanonicalArchiveUsername } from "../../archive/aliases";
import { loadPredictionPositions } from "../../lib/predictionPositions";
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
import { describeCoinTransactions } from "./transactionDescriptions";

const atomicDbOpeningSchema = z.string().trim().min(1).max(1000);
const atomicDbPlayerSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9_-]+$/i, "Invalid Lichess username.");
const coinAdmin = "seaside_tiramisu";
const coinUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9_-]+$/i, "Invalid Lichess username.");
const coinTransactionReasonSchema = z.enum(COIN_TRANSACTION_REASONS);
const coinTransactionsPageSize = 50;
const leaderboardQueryPageSize = 1_000;
const hiddenLeaderboardUsernames = new Set(["admin", "prediction_admin"]);

type CoinAccountRow = { username: string; balance: number };
const loadAllLeaderboardRows = async <Row>(
  queryPage: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>,
  errorMessage: string,
): Promise<Row[]> => {
  const rows: Row[] = [];
  for (let from = 0; ; from += leaderboardQueryPageSize) {
    const { data, error } = await queryPage(from, from + leaderboardQueryPageSize - 1);
    if (error) throw new Error(errorMessage);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < leaderboardQueryPageSize) return rows;
  }
};

const addAmount = (amounts: Map<string, number>, username: string, amount: number) => {
  amounts.set(username, (amounts.get(username) ?? 0) + amount);
};

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("summary") }),
  z.object({ action: z.literal("history") }),
  z.object({ action: z.literal("redCharcoalAccess") }),
  z.object({ action: z.literal("leaderboard") }),
  z.object({
    action: z.literal("transactions"),
    page: z.number().int().positive().max(10_000).optional().default(1),
    username: coinUsernameSchema.optional(),
    reasons: z
      .array(coinTransactionReasonSchema)
      .min(1)
      .max(COIN_TRANSACTION_REASONS.length)
      .optional(),
  }),
  z.object({ action: z.literal("claimDaily") }),
  z.object({ action: z.literal("listRedemptions") }),
  z.object({
    action: z.literal("updateRedemption"),
    id: z.number().int().positive(),
    status: z.enum(["fulfilled", "cancelled"]),
  }),
  z.object({
    action: z.literal("give"),
    recipientUsername: z.string().trim().min(1).max(50),
    amount: z.number().int().min(1).max(100000),
    message: z.string().trim().max(280).optional().default(""),
  }),
  z.object({
    action: z.literal("redeem"),
    itemKey: z.enum(REDEEMABLE_SHOP_ITEM_KEYS),
    requestedUsername: z
      .string()
      .trim()
      .min(3)
      .max(30)
      .regex(/^[a-z0-9_-]+$/i, "Use only letters, numbers, underscores, and hyphens.")
      .optional(),
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

const loadCoinRankings = async (supabase: SupabaseClient, username?: string) => {
  const [accounts, unsettledMarkets] = await Promise.all([
    loadAllLeaderboardRows<CoinAccountRow>((from, to) => {
      const query = supabase.from("coin_accounts").select("username,balance");
      if (username) query.eq("username", username);
      return query.order("username").range(from, to);
    }, "Unable to load coin rankings: coin accounts could not be read."),
    loadAllLeaderboardRows<{ id: string }>(
      (from, to) =>
        supabase
          .from("prediction_markets")
          .select("id")
          .in("status", ["open", "closed"])
          .order("id")
          .range(from, to),
      "Unable to load coin rankings: prediction markets could not be read.",
    ),
  ]);

  const openBetCosts = new Map<string, number>();
  const unsettledMarketIds = unsettledMarkets.map((market) => market.id);

  if (unsettledMarketIds.length > 0) {
    const positions = await loadPredictionPositions(supabase, unsettledMarketIds, username, {
      verifyHoldings: true,
    });
    for (const position of positions) {
      if (position.quantity > 0)
        addAmount(openBetCosts, position.username, position.remaining_cost_coins);
    }
  }

  const rankings = accounts
    .filter(
      (account) => username || !hiddenLeaderboardUsernames.has(account.username.toLowerCase()),
    )
    .map((account) => {
      const inBets = openBetCosts.get(account.username) ?? 0;
      return {
        username: account.username,
        netWorth: account.balance + inBets,
        balance: account.balance,
        inBets,
      };
    })
    .sort(
      (left, right) =>
        right.netWorth - left.netWorth || left.username.localeCompare(right.username),
    );
  return rankings;
};

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
  if (
    (input.action === "redeem" || input.action === "requestAtomicDbAnalysis") &&
    Date.now() < Date.parse(SHOP_REOPENS_AT)
  ) {
    throw new HttpError(503, "The shop is closed until November 3 at 00:00 UTC.");
  }
  if (input.action === "leaderboard") {
    const supabase = createServerSupabase("Atomic Coins service");
    return identityResponse(identity, 200, { result: await loadCoinRankings(supabase) });
  }
  if (input.action === "transactions") {
    const supabase = createServerSupabase("Atomic Coins service");
    const from = (input.page - 1) * coinTransactionsPageSize;
    const to = from + coinTransactionsPageSize - 1;
    let query = supabase
      .from("coin_transactions")
      .select("id,username,amount,reason,metadata,created_at", { count: "exact" });
    // This feed is public; private moderation debits are not public transaction reasons.
    query = query.in("reason", input.reasons ?? [...COIN_TRANSACTION_REASONS]);
    if (input.username) query = query.eq("username", input.username.toLowerCase());
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (error) throw new Error(`Unable to load coin transactions: ${error.message}`);
    const total = count ?? 0;
    const transactions = await describeCoinTransactions(supabase, data);
    return identityResponse(identity, 200, {
      result: transactions.map((transaction) =>
        transaction.reason === "puzzle_tagging"
          ? {
              ...transaction,
              // Keep the motif private, including on transactions written before this change.
              metadata: {
                puzzleId: transaction.metadata?.puzzleId,
                action: transaction.metadata?.action,
              },
            }
          : transaction,
      ),
      pagination: {
        page: input.page,
        pageSize: coinTransactionsPageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / coinTransactionsPageSize)),
      },
    });
  }
  const sessionUsername = requireUsername(identity, "Log in with Lichess to use Atomic Coins.");
  // Version 2 site sessions already contain the canonical username. Do not make
  // purchases depend on a second archive lookup, which can fail independently.
  const username = sessionUsername.trim().toLowerCase();
  if (input.action === "listRedemptions" || input.action === "updateRedemption") {
    if (username !== coinAdmin) {
      throw new HttpError(403, "Shop administration is restricted.");
    }
    const supabase = createServerSupabase("Atomic Coins service");
    if (input.action === "listRedemptions") {
      let { data, error } = await supabase
        .from("shop_redemptions")
        .select(
          "id,username,item_key,cost,status,created_at,fulfilled_at,fulfilled_by,request_details",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(500);
      if (error?.code === "42703" && /request_details/i.test(error.message)) {
        const legacyResult = await supabase
          .from("shop_redemptions")
          .select("id,username,item_key,cost,status,created_at,fulfilled_at,fulfilled_by")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(500);
        data =
          legacyResult.data?.map((redemption) => ({
            ...redemption,
            request_details: {},
          })) ?? null;
        error = legacyResult.error;
      }
      if (error) throw new Error(`Unable to load shop redemptions: ${error.message}`);
      return identityResponse(identity, 200, { redemptions: data });
    }
    const { data, error } = await supabase.rpc("update_shop_redemption_status", {
      p_id: input.id,
      p_status: input.status,
      p_updated_by: username,
    });
    if (error) {
      if (/pending shop redemption not found/i.test(error.message)) {
        throw new HttpError(409, "This redemption is no longer pending.");
      }
      throw new Error(`Unable to update shop redemption: ${error.message}`);
    }
    return identityResponse(identity, 200, { redemption: data });
  }
  if (input.action === "history") {
    const supabase = createServerSupabase("Atomic Coins service");
    const columns = "id,item_key,cost,status,created_at,fulfilled_at";
    const { data, error } = await supabase
      .from("shop_redemptions")
      .select(columns)
      .eq("username", username)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(50);
    if (error) throw new Error(`Unable to load purchase history: ${error.message}`);
    if (data?.length === 50) {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      // Keep purchases that control shop availability even after they leave the recent list.
      const { data: availabilityPurchases, error: availabilityError } = await supabase
        .from("shop_redemptions")
        .select(columns)
        .eq("username", username)
        .neq("status", "cancelled")
        .or(
          `item_key.like.theme_*,and(item_key.eq.lichess_patron_month,created_at.gte.${monthStart.toISOString()})`,
        );
      if (availabilityError)
        throw new Error(`Unable to load purchase history: ${availabilityError.message}`);
      const purchases = new Map(
        [...data, ...(availabilityPurchases ?? [])].map((purchase) => [purchase.id, purchase]),
      );
      const result = [...purchases.values()].sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id,
      );
      return identityResponse(identity, 200, { result });
    }
    return identityResponse(identity, 200, { result: data });
  }
  let canonicalRecipientUsername = input.action === "give" ? input.recipientUsername : "";
  if (input.action === "give") {
    let recipientIdentity: string;
    try {
      recipientIdentity = await resolveCanonicalArchiveUsername(input.recipientUsername);
    } catch {
      throw new HttpError(503, "Coin gifts are temporarily unavailable. Please try again.");
    }
    if (username && username === recipientIdentity) {
      throw new HttpError(409, "You can’t gift coins between aliases of the same player.");
    }
    canonicalRecipientUsername = recipientIdentity;
  }
  const supabase = createServerSupabase("Atomic Coins service");
  if (input.action === "redCharcoalAccess") {
    const { data, error } = await supabase
      .from("shop_redemptions")
      .select("id")
      .eq("username", username)
      .eq("item_key", "theme_red_charcoal")
      .eq("status", "fulfilled")
      .limit(1);
    if (error) throw new Error(`Unable to check theme ownership: ${error.message}`);
    return identityResponse(identity, 200, { owned: Boolean(data?.length) });
  }
  if (input.action === "redeem" && input.itemKey === "username_change") {
    if (!input.requestedUsername) {
      throw new HttpError(400, "Enter the username you want to request.");
    }
    const { data, error } = await supabase.rpc("request_username_change", {
      p_username: username,
      p_requested_username: input.requestedUsername,
    });
    if (error) {
      if (/not enough coins/i.test(error.message)) {
        throw new HttpError(409, "You need 100 coins to request a username change.");
      }
      if (/username change already pending/i.test(error.message)) {
        throw new HttpError(409, "You already have a username change awaiting approval.");
      }
      if (/requested username is unchanged/i.test(error.message)) {
        throw new HttpError(400, "Enter a username different from your current one.");
      }
      throw new Error(`Unable to request a username change: ${error.message}`);
    }
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
    return supabase.rpc(
      input.itemKey === "theme_red_charcoal" ? "purchase_shop_theme" : "redeem_shop_item",
      {
        p_username: username,
        p_item_key: input.itemKey,
      },
    );
  })();
  const [{ data, error }, portfolio] = await Promise.all([
    rpc,
    input.action === "summary" ? loadCoinRankings(supabase, username) : Promise.resolve(null),
  ]);
  if (error) {
    if (/daily bonus already claimed/i.test(error.message)) {
      throw new HttpError(409, "You already claimed today’s bonus.");
    }
    if (/not enough coins/i.test(error.message)) {
      const redemptionCost =
        input.action === "requestAtomicDbAnalysis"
          ? SHOP_ITEM_COSTS.atomicdb_analysis_12h
          : input.action === "redeem"
            ? SHOP_ITEM_COSTS[input.itemKey]
            : 0;
      throw new HttpError(
        409,
        input.action === "give"
          ? "You don’t have enough coins for this gift."
          : input.action === "requestAtomicDbAnalysis"
            ? "You need 200 coins to request this analysis."
            : `You need ${redemptionCost.toLocaleString()} coins to buy this item.`,
      );
    }
    if (/recipient must have/i.test(error.message)) {
      throw new HttpError(404, "That player does not have an Atomic Puzzles account.");
    }
    throw new Error(`Unable to update coins: ${error.message}`);
  }
  if (input.action === "summary") {
    return identityResponse(identity, 200, {
      result: { ...data, inBets: portfolio?.[0]?.inBets ?? 0 },
    });
  }
  return identityResponse(identity, 200, { result: data });
};
