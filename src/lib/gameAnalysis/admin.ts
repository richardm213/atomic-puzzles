import { z } from "zod";

import { postApi } from "../api/postApi";

export const GAME_ANALYSIS_ADMIN_USERNAME = "seaside_tiramisu";

export type AdminGameAnalysis = {
  gameId: string;
  status: "queued" | "processing" | "ready" | "failed";
  requestedBy: string;
  completedMoves: number;
  queuedMoves: number;
  totalMoves: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
};

const recordSchema = z.object({
  gameId: z.string(),
  status: z.enum(["queued", "processing", "ready", "failed"]),
  requestedBy: z.string(),
  completedMoves: z.number().int().nonnegative(),
  queuedMoves: z.number().int().nonnegative(),
  totalMoves: z.number().int().nonnegative(),
  error: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  lastCheckedAt: z.string().nullable(),
  nextCheckAt: z.string().nullable(),
});

const responseSchema = z.object({
  pending: z.array(recordSchema),
  pendingTotal: z.number().int().nonnegative(),
  completed: z.array(recordSchema),
  failed: z.array(recordSchema),
  finishedLast7Days: z.number().int().nonnegative(),
  generatedAt: z.string(),
});

const finishedResponseSchema = z.object({
  items: z.array(recordSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().positive(),
  generatedAt: z.string(),
});

export const fetchAdminGameAnalyses = async (): Promise<{
  pending: AdminGameAnalysis[];
  pendingTotal: number;
  completed: AdminGameAnalysis[];
  failed: AdminGameAnalysis[];
  finishedLast7Days: number;
  generatedAt: string;
}> =>
  postApi(
    "/api/game-analysis",
    { action: "adminList" },
    {
      schema: responseSchema,
      errorMessage: "Unable to load game analyses.",
      invalidMessage: "The game analysis service returned invalid data.",
    },
  );

export const fetchFinishedGameAnalyses = async (
  page: number,
  pageSize: number,
): Promise<{
  items: AdminGameAnalysis[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  generatedAt: string;
}> =>
  postApi(
    "/api/game-analysis",
    { action: "adminFinished", page, pageSize },
    {
      schema: finishedResponseSchema,
      errorMessage: "Unable to load finished game analyses.",
      invalidMessage: "The game analysis service returned invalid data.",
    },
  );
