import { z } from "zod";

import {
  averageCentipawnLossForEvaluations,
  CLASSIFICATION_SYMBOLS,
  GAME_ANALYSIS_STATUSES,
  gameAccuracyForEvaluations,
  type GameAnalysisRecord,
  MOVE_CLASSIFICATIONS,
} from "../../../shared/domain/gameAnalysis";
import { postApi } from "../api/postApi";

export type {
  GameAnalysisRecord,
  GameAnalysisSummary,
  GameMoveAssessment,
  MoveClassification,
} from "../../../shared/domain/gameAnalysis";

const atomicDbLineSchema = z.object({
  move: z.string().nullable(),
  cp: z.number().nullable(),
  mate: z.number().nullable(),
  depth: z.number().nullable(),
  nodes: z.number().nullable(),
  pv: z.array(z.string()),
});

const positionSchema = z.object({
  fen: z.string(),
  key: z.string().nullable(),
  status: z.string(),
  closure: z.string().nullable(),
  score: z.number().nullable(),
  point: z.number().nullable(),
  bestMove: z.string().nullable(),
  budgetNodes: z.number().nullable(),
  lines: z.array(atomicDbLineSchema),
});

const countsSchema = z.record(z.enum(MOVE_CLASSIFICATIONS), z.number());
const summarySchema = z
  .object({
    positions: z.array(positionSchema),
    assessments: z.array(
      z.object({
        ply: z.number().int().positive(),
        uci: z.string(),
        classification: z.enum(MOVE_CLASSIFICATIONS),
        symbol: z.string(),
        winPercentBefore: z.number(),
        winPercentAfter: z.number(),
        winPercentLoss: z.number(),
        bestMove: z.string().nullable(),
      }),
    ),
    evaluations: z.array(z.number()),
    whiteAccuracy: z.number().optional(),
    blackAccuracy: z.number().optional(),
    whiteAverageCentipawnLoss: z.number().optional(),
    blackAverageCentipawnLoss: z.number().optional(),
    whiteCounts: countsSchema,
    blackCounts: countsSchema,
  })
  .transform((summary) => {
    const normalizeCounts = (counts: typeof summary.whiteCounts) => ({
      ...counts,
      excellent: 0,
      good: 0,
      best: counts.best + counts.good + counts.excellent,
    });
    return {
      ...summary,
      assessments: summary.assessments.map((assessment) =>
        assessment.classification === "excellent" || assessment.classification === "good"
          ? {
              ...assessment,
              classification: "best" as const,
              symbol: CLASSIFICATION_SYMBOLS.best,
            }
          : assessment,
      ),
      whiteCounts: normalizeCounts(summary.whiteCounts),
      blackCounts: normalizeCounts(summary.blackCounts),
      ...gameAccuracyForEvaluations(summary.evaluations),
      ...averageCentipawnLossForEvaluations(summary.evaluations),
    };
  });

const recordSchema = z.object({
  gameId: z.string(),
  status: z.enum(GAME_ANALYSIS_STATUSES),
  requestedBy: z.string(),
  totalPositions: z.number().int().positive(),
  completedPositions: z.number().int().nonnegative(),
  queuedPositions: z.number().int().nonnegative(),
  cost: z.number(),
  error: z.string().nullable(),
  result: summarySchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

const responseSchema = z.object({
  analysis: recordSchema.nullable(),
  created: z.boolean().optional(),
  balance: z.number().nullable().optional(),
});

export const fetchGameAnalysis = async (gameId: string): Promise<GameAnalysisRecord | null> => {
  const response = await postApi(
    "/api/game-analysis",
    { action: "status", gameId },
    {
      schema: responseSchema,
      errorMessage: "Unable to load game analysis.",
      invalidMessage: "The game analysis service returned invalid data.",
    },
  );
  return response.analysis;
};

export const requestGameAnalysis = async (
  gameId: string,
  initialFen: string,
  moves: string[],
): Promise<{ analysis: GameAnalysisRecord; balance: number | null }> => {
  const response = await postApi(
    "/api/game-analysis",
    { action: "request", gameId, initialFen, moves },
    {
      schema: responseSchema,
      errorMessage: "Unable to request game analysis.",
      invalidMessage: "The game analysis service returned invalid data.",
      timeoutMs: 30_000,
    },
  );
  if (!response.analysis) throw new Error("The game analysis job was not created.");
  return { analysis: response.analysis, balance: response.balance ?? null };
};
