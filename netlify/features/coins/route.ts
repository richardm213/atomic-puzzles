import { z } from "zod";

import {
  COIN_TRANSACTION_REASONS,
  REDEEMABLE_SHOP_ITEM_KEYS,
  SHOP_ITEM_COSTS,
  SHOP_REOPENS_AT,
} from "../../../shared/domain/coins";
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
import {
  calculatePredictionPositionCost,
  type PredictionPositionFill,
} from "../betting/predictionBook";

const atomicDbOpeningSchema = z.string().trim().min(1).max(1000);
const atomicDbPlayerSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-z0-9_-]+$/i, "Invalid Lichess username.");
const coinAdmin = "seaside_tiramisu";
const coinBanUsernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9_-]+$/i, "Invalid Lichess username.");
const coinTransactionReasonSchema = z.enum(COIN_TRANSACTION_REASONS);
const coinTransactionsPageSize = 50;
const leaderboardQueryPageSize = 1_000;

type CoinAccountRow = { username: string; balance: number };
type OpenBetRow = { id: number; username: string; total_cost: number };
type PredictionPositionRow = {
  market_id: string;
  username: string;
  outcome: "yes" | "no";
  quantity: number;
};
type LegacyPositionCreditRow = {
  source_bet_id: number;
  market_id: string;
  username: string;
  outcome: "yes" | "no";
  quantity: number;
  price_cents: number;
};
type LeaderboardPredictionFill = PredictionPositionFill & { market_id: string };

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
  z.object({ action: z.literal("leaderboard") }),
  z.object({
    action: z.literal("transactions"),
    page: z.number().int().positive().max(10_000).optional().default(1),
    username: coinBanUsernameSchema.optional(),
    reasons: z
      .array(coinTransactionReasonSchema)
      .min(1)
      .max(COIN_TRANSACTION_REASONS.length)
      .optional(),
  }),
  z.object({ action: z.literal("claimDaily") }),
  z.object({ action: z.literal("listBans") }),
  z.object({ action: z.literal("listRedemptions") }),
  z.object({
    action: z.literal("updateRedemption"),
    id: z.number().int().positive(),
    status: z.enum(["fulfilled", "cancelled"]),
  }),
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
    const [accounts, openBets, unsettledMarkets] = await Promise.all([
      loadAllLeaderboardRows<CoinAccountRow>(
        (from, to) =>
          supabase
            .from("coin_accounts")
            .select("username,balance")
            .order("username")
            .range(from, to),
        "Unable to load coin rankings: coin accounts could not be read.",
      ),
      loadAllLeaderboardRows<OpenBetRow>(
        (from, to) =>
          supabase
            .from("tournament_bets")
            .select("id,username,total_cost")
            .eq("status", "open")
            .order("id")
            .range(from, to),
        "Unable to load coin rankings: tournament bets could not be read.",
      ),
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
      const [positions, fills, legacyCredits] = await Promise.all([
        loadAllLeaderboardRows<PredictionPositionRow>(
          (from, to) =>
            supabase
              .from("prediction_positions")
              .select("market_id,username,outcome,quantity")
              .in("market_id", unsettledMarketIds)
              .gt("quantity", 0)
              .order("market_id")
              .order("username")
              .order("outcome")
              .range(from, to),
          "Unable to load coin rankings: prediction positions could not be read.",
        ),
        loadAllLeaderboardRows<LeaderboardPredictionFill>(
          (from, to) =>
            supabase
              .from("prediction_fills")
              .select(
                "id,market_id,outcome,price_cents,quantity,buyer_username,seller_username,pair_key,created_at",
              )
              .in("market_id", unsettledMarketIds)
              .order("id")
              .range(from, to),
          "Unable to load coin rankings: prediction fills could not be read.",
        ),
        loadAllLeaderboardRows<LegacyPositionCreditRow>(
          (from, to) =>
            supabase
              .from("prediction_legacy_position_credits")
              .select("source_bet_id,market_id,username,outcome,quantity,price_cents")
              .in("market_id", unsettledMarketIds)
              .order("source_bet_id")
              .range(from, to),
          "Unable to load coin rankings: legacy prediction positions could not be read.",
        ),
      ]);

      const fillsByMarket = new Map<string, LeaderboardPredictionFill[]>();
      for (const fill of fills) {
        const marketFills = fillsByMarket.get(fill.market_id);
        if (marketFills) marketFills.push(fill);
        else fillsByMarket.set(fill.market_id, [fill]);
      }
      const legacyCostsByOwner = new Map<
        string,
        Record<"yes" | "no", { quantity: number; costCents: number }>
      >();
      const convertedBetIds = new Set<number>();
      for (const credit of legacyCredits) {
        convertedBetIds.add(credit.source_bet_id);
        const ownerKey = `${credit.market_id}:${credit.username}`;
        const ownerCosts = legacyCostsByOwner.get(ownerKey) ?? {
          yes: { quantity: 0, costCents: 0 },
          no: { quantity: 0, costCents: 0 },
        };
        ownerCosts[credit.outcome].quantity += credit.quantity;
        ownerCosts[credit.outcome].costCents += credit.quantity * credit.price_cents;
        legacyCostsByOwner.set(ownerKey, ownerCosts);
      }

      const costsByMarketAndUser = new Map<
        string,
        ReturnType<typeof calculatePredictionPositionCost>
      >();
      for (const position of positions) {
        // Liquidity is seeded directly for the internal market-maker account and is
        // intentionally excluded from public rankings.
        if (position.username === "prediction_admin") continue;
        const ownerKey = `${position.market_id}:${position.username}`;
        let costs = costsByMarketAndUser.get(ownerKey);
        if (!costs) {
          costs = calculatePredictionPositionCost(
            fillsByMarket.get(position.market_id) ?? [],
            position.username,
            legacyCostsByOwner.get(ownerKey),
          );
          costsByMarketAndUser.set(ownerKey, costs);
        }
        const traded = costs[position.outcome];
        if (Math.abs(traded.quantity - position.quantity) > 0.000001) {
          throw new Error(
            "Unable to load coin rankings: prediction position history is incomplete.",
          );
        }
        const positionCostCents = (traded.averagePriceCents ?? 0) * traded.quantity;
        addAmount(openBetCosts, position.username, positionCostCents / 100);
      }

      for (const bet of openBets) {
        if (!convertedBetIds.has(bet.id)) addAmount(openBetCosts, bet.username, bet.total_cost);
      }
    } else {
      for (const bet of openBets) addAmount(openBetCosts, bet.username, bet.total_cost);
    }
    const rankings = accounts
      .filter((account) => account.username !== "prediction_admin")
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
    return identityResponse(identity, 200, { result: rankings });
  }
  if (input.action === "transactions") {
    const supabase = createServerSupabase("Atomic Coins service");
    const from = (input.page - 1) * coinTransactionsPageSize;
    const to = from + coinTransactionsPageSize - 1;
    let query = supabase
      .from("coin_transactions")
      .select("id,username,amount,reason,metadata,created_at", { count: "exact" });
    if (input.reasons) query = query.in("reason", input.reasons);
    if (input.username) query = query.eq("username", input.username.toLowerCase());
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (error) throw new Error(`Unable to load coin transactions: ${error.message}`);
    const total = count ?? 0;
    return identityResponse(identity, 200, {
      result: data,
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
  if (
    input.action === "listBans" ||
    input.action === "ban" ||
    input.action === "revokeBan" ||
    input.action === "listRedemptions" ||
    input.action === "updateRedemption"
  ) {
    if (username !== coinAdmin) {
      throw new HttpError(403, "Shop administration is restricted.");
    }
    const supabase = createServerSupabase("Atomic Coins service");
    if (input.action === "listRedemptions") {
      const { data, error } = await supabase
        .from("shop_redemptions")
        .select(
          "id,username,item_key,cost,status,created_at,fulfilled_at,fulfilled_by,request_details",
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(500);
      if (error) throw new Error(`Unable to load shop redemptions: ${error.message}`);
      return identityResponse(identity, 200, { redemptions: data });
    }
    if (input.action === "updateRedemption") {
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
  return identityResponse(identity, 200, { result: data });
};
