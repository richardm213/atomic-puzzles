import { z } from "zod";

import { postApi } from "../api/postApi";
import { announceCoinsEarned } from "./coinEvents";

export const DAILY_COIN_BONUS = 5;

export type ShopItemKey =
  | "discord_nitro_month"
  | "discord_nitro_year"
  | "flowers_500"
  | "lichess_patron_month"
  | "next_prize_tournament_format"
  | "atomicdb_analysis_12h";

export type AtomicDbAnalysisRequest =
  | { focus: "higher_eval"; openings: string[]; players?: never }
  | { focus: "player_lines"; openings: [string]; players: string[] };

export type CoinSummary = {
  balance: number;
  dailyClaimAvailable: boolean;
};

export type RedemptionHistoryItem = {
  id: number;
  itemKey: Exclude<ShopItemKey, "atomicdb_analysis_12h">;
  cost: number;
  status: "pending" | "fulfilled" | "cancelled";
  createdAt: string;
  fulfilledAt: string | null;
};

const summarySchema = z.object({
  result: z.object({
    balance: z.number(),
    dailyClaimAvailable: z.boolean().optional().default(false),
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
        item_key: z.enum([
          "discord_nitro_month",
          "discord_nitro_year",
          "flowers_500",
          "lichess_patron_month",
          "next_prize_tournament_format",
        ]),
        cost: z.number(),
        status: z.enum(["pending", "fulfilled", "cancelled"]),
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

const request = async (body: Record<string, unknown>) => {
  const response = await postApi("/api/coins", body, {
    schema: summarySchema,
    errorMessage: "Unable to update coins.",
    invalidMessage: "The coin service returned invalid data.",
  });
  return response.result;
};

export const fetchCoinSummary = (): Promise<CoinSummary> => request({ action: "summary" });
export const fetchRedemptionHistory = async (): Promise<RedemptionHistoryItem[]> => {
  const response = await postApi(
    "/api/coins",
    { action: "history" },
    {
      schema: redemptionHistorySchema,
      errorMessage: "Unable to load redemption history.",
      invalidMessage: "The coin service returned invalid redemption history.",
    },
  );
  return response.result;
};
export const claimDailyCoins = async (): Promise<CoinSummary> => {
  const result = await request({ action: "claimDaily" });
  if (result.awarded) announceCoinsEarned(DAILY_COIN_BONUS, "Daily bonus claimed");
  return result;
};
export const redeemShopItem = (itemKey: ShopItemKey) => request({ action: "redeem", itemKey });
export const requestAtomicDbAnalysis = (details: AtomicDbAnalysisRequest) =>
  request({ action: "requestAtomicDbAnalysis", ...details });

type SocialCoinInput = {
  recipientUsername: string;
  amount: number;
  message?: string;
};

export const giveCoins = ({ recipientUsername, amount, message = "" }: SocialCoinInput) =>
  request({ action: "give", recipientUsername, amount, message });
