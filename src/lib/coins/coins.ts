import { z } from "zod";

import {
  COIN_TRANSACTION_REASONS,
  type CoinTransactionReason,
  SHOP_ITEM_KEYS,
  SHOP_REDEMPTION_STATUSES,
  type ShopItemKey,
  type ShopRedemptionStatus,
} from "../../../shared/domain/coins";
import { postApi } from "../api/postApi";
import { announceCoinsEarned } from "./coinEvents";

export type { CoinTransactionReason, ShopItemKey } from "../../../shared/domain/coins";

export const DAILY_COIN_BONUS = 10;

export type AtomicDbAnalysisRequest =
  | { focus: "higher_eval"; openings: string[]; players?: never }
  | { focus: "player_lines"; openings: [string]; players: string[] };

export type CoinSummary = {
  balance: number;
  dailyClaimAvailable: boolean;
  economyBan?: {
    endsAt: string;
    reason: string;
  } | null;
};

export type CoinRanking = {
  username: string;
  netWorth: number;
  balance: number;
  inBets: number;
};

export const coinTransactionReasons = COIN_TRANSACTION_REASONS;

export type CoinTransaction = {
  id: number;
  username: string;
  amount: number;
  reason: CoinTransactionReason;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type CoinTransactionPage = {
  transactions: CoinTransaction[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type RedemptionHistoryItem = {
  id: number;
  itemKey: ShopItemKey;
  cost: number;
  status: ShopRedemptionStatus;
  createdAt: string;
  fulfilledAt: string | null;
};

const summarySchema = z.object({
  result: z.object({
    balance: z.number(),
    dailyClaimAvailable: z.boolean().optional().default(false),
    economyBan: z
      .object({
        endsAt: z.string(),
        reason: z.string(),
      })
      .nullable()
      .optional()
      .default(null),
    awarded: z.number().optional(),
    redemptionId: z.number().optional(),
    transferId: z.number().optional(),
    requestId: z.number().optional(),
    recipientUsername: z.string().optional(),
    amount: z.number().optional(),
    status: z.string().optional(),
  }),
});

const redemptionHistorySchema = z.object({
  result: z.array(
    z
      .object({
        id: z.number(),
        item_key: z.enum(SHOP_ITEM_KEYS),
        cost: z.number(),
        status: z.enum(SHOP_REDEMPTION_STATUSES),
        created_at: z.string(),
        fulfilled_at: z.string().nullable(),
      })
      .transform((item) => ({
        id: item.id,
        itemKey: item.item_key,
        cost: item.cost,
        status: item.status,
        createdAt: item.created_at,
        fulfilledAt: item.fulfilled_at,
      })),
  ),
});

const coinRankingsSchema = z.object({
  result: z.array(
    z
      .object({
        username: z.string(),
        netWorth: z.number(),
        balance: z.number(),
        inBets: z.number(),
      })
      .transform((entry) => ({
        username: entry.username,
        netWorth: entry.netWorth,
        balance: entry.balance,
        inBets: entry.inBets,
      })),
  ),
});

const coinTransactionsSchema = z.object({
  result: z.array(
    z
      .object({
        id: z.number(),
        username: z.string(),
        amount: z.number(),
        reason: z.enum(coinTransactionReasons),
        metadata: z.record(z.string(), z.unknown()).optional().default({}),
        created_at: z.string(),
      })
      .transform((transaction) => ({
        id: transaction.id,
        username: transaction.username,
        amount: transaction.amount,
        reason: transaction.reason,
        metadata: transaction.metadata,
        createdAt: transaction.created_at,
      })),
  ),
  pagination: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().positive(),
  }),
});

const request = async (body: Record<string, unknown>) => {
  const response = await postApi("/api/coins", body, {
    schema: summarySchema,
    errorMessage: "Unable to update coins.",
    invalidMessage: "The coin service returned invalid data.",
  });
  return response.result;
};

export const fetchCoinSummary = (): Promise<CoinSummary> => request({ action: "summary" });
export const fetchCoinRankings = async (): Promise<CoinRanking[]> => {
  const response = await postApi(
    "/api/coins",
    { action: "leaderboard" },
    {
      schema: coinRankingsSchema,
      errorMessage: "Unable to load coin rankings.",
      invalidMessage: "The coin service returned invalid rankings.",
    },
  );
  return response.result;
};
export const fetchCoinTransactions = async (
  reasons?: CoinTransactionReason[],
  page = 1,
  username = "",
): Promise<CoinTransactionPage> => {
  const response = await postApi(
    "/api/coins",
    {
      action: "transactions",
      page,
      ...(reasons?.length ? { reasons } : {}),
      ...(username ? { username } : {}),
    },
    {
      schema: coinTransactionsSchema,
      errorMessage: "Unable to load coin transactions.",
      invalidMessage: "The coin service returned invalid transactions.",
    },
  );
  return {
    transactions: response.result,
    ...response.pagination,
  };
};
export const fetchRedemptionHistory = async (): Promise<RedemptionHistoryItem[]> => {
  const response = await postApi(
    "/api/coins",
    { action: "history" },
    {
      schema: redemptionHistorySchema,
      errorMessage: "Unable to load purchase history.",
      invalidMessage: "The coin service returned invalid purchase history.",
    },
  );
  return response.result;
};
export const claimDailyCoins = async (): Promise<CoinSummary> => {
  const result = await request({ action: "claimDaily" });
  if (result.awarded) announceCoinsEarned(result.awarded, "Daily bonus claimed");
  return result;
};
export const redeemShopItem = (itemKey: ShopItemKey, requestedUsername?: string) =>
  request({ action: "redeem", itemKey, ...(requestedUsername ? { requestedUsername } : {}) });
export const requestAtomicDbAnalysis = (details: AtomicDbAnalysisRequest) =>
  request({ action: "requestAtomicDbAnalysis", ...details });

type SocialCoinInput = {
  recipientUsername: string;
  amount: number;
  message?: string;
};

export const giveCoins = ({ recipientUsername, amount, message = "" }: SocialCoinInput) =>
  request({ action: "give", recipientUsername, amount, message });
