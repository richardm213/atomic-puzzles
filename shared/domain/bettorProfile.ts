import { z } from "zod";

export const isPublicBettor = (username: string) =>
  !["admin", "prediction_admin"].includes(username.toLowerCase());

export const bettorProfileSchema = z.object({
  username: z.string(),
  realizedPnl: z.number(),
  netWorth: z.number(),
  balance: z.number(),
  openCost: z.number(),
  puzzleSolveCoins: z.number(),
  puzzleCreationCoins: z.number(),
  coinsSpent: z.number().nonpositive(),
  markets: z.record(
    z.string(),
    z.object({
      title: z.string(),
      path: z.string().nullable(),
      yes: z.string(),
      no: z.string(),
    }),
  ),
  openPositions: z.array(
    z.object({
      marketId: z.string(),
      outcome: z.enum(["yes", "no"]),
      quantity: z.number(),
      cost: z.number(),
    }),
  ),
  pnlByDay: z.array(z.object({ day: z.string(), pnl: z.number() })),
  settledBets: z.array(
    z.object({
      marketId: z.string(),
      outcome: z.enum(["yes", "no"]).nullable(),
      settledAt: z.string(),
      status: z.enum(["resolved", "refunded"]),
      pnl: z.number(),
    }),
  ),
});

export type BettorProfile = z.infer<typeof bettorProfileSchema>;
