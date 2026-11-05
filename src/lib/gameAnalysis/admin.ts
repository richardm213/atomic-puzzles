import { z } from "zod";

import { postApi } from "../api/postApi";

export type AdminGameAnalysis = {
  gameId: string;
  status: "queued" | "processing" | "ready";
  requestedBy: string;
  completedMoves: number;
  totalMoves: number;
  createdAt: string;
  completedAt: string | null;
};

const recordSchema = z.object({
  gameId: z.string(),
  status: z.enum(["queued", "processing", "ready"]),
  requestedBy: z.string(),
  completedMoves: z.number().int().nonnegative(),
  totalMoves: z.number().int().nonnegative(),
  createdAt: z.string(),
  completedAt: z.string().nullable(),
});

const responseSchema = z.object({
  pending: z.array(recordSchema),
  completed: z.array(recordSchema),
});

export const fetchAdminGameAnalyses = async (): Promise<{
  pending: AdminGameAnalysis[];
  completed: AdminGameAnalysis[];
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
