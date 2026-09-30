import { z } from "zod";

import {
  normalizePuzzleLevel,
  normalizePuzzleRatingSource,
  type PuzzleLevel,
  puzzleRatingForLevel,
  type PuzzleRatingSource,
} from "../../../shared/domain/puzzles/puzzleRating";
import { postApi } from "../api/postApi";

export type PuzzleRating = {
  level: PuzzleLevel;
  rating: number;
  ratingDeviation: number;
  attempts: number;
  successes: number;
  source: PuzzleRatingSource;
  updatedAt: string | null;
};

const puzzleRatingResponseSchema = z.object({
  puzzleId: z.number().int().positive(),
  level: z.number().int().min(1).max(5),
  rating: z.number().int(),
  ratingDeviation: z.number().int().nonnegative(),
  attempts: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  source: z.enum(["system", "ai", "human"]),
  updatedAt: z.string().nullable(),
});

const puzzleRatingRefreshResponseSchema = z.object({ refreshed: z.literal(true) });

export const puzzleRatingFromRow = (
  row: Record<string, unknown> | null | undefined,
): PuzzleRating => {
  const rawRelation = row?.["rating_state"];
  const relation = Array.isArray(rawRelation) ? rawRelation[0] : rawRelation;

  if (relation && typeof relation === "object") {
    const state = relation as Record<string, unknown>;
    const rawHumanLevel = Number(state["human_level"]);
    const hasHumanLevel =
      Number.isInteger(rawHumanLevel) && rawHumanLevel >= 1 && rawHumanLevel <= 5;
    const level = normalizePuzzleLevel(hasHumanLevel ? rawHumanLevel : state["computed_level"]);
    const attempts = Math.max(0, Math.round(Number(state["attempts"]) || 0));

    return {
      level,
      // A manual V level selects the seed and display label. The stored rating
      // still includes every first-attempt result replayed from that seed.
      rating: Math.round(Number(state["rating"]) || puzzleRatingForLevel(level)),
      ratingDeviation: Math.max(0, Math.round(Number(state["rating_deviation"]) || 300)),
      attempts,
      successes: Math.max(0, Math.round(Number(state["successes"]) || 0)),
      source: hasHumanLevel ? "human" : attempts >= 4 ? "ai" : "system",
      updatedAt: typeof state["updated_at"] === "string" ? state["updated_at"] : null,
    };
  }

  return {
    level: 3,
    rating: puzzleRatingForLevel(3),
    ratingDeviation: 300,
    attempts: 0,
    successes: 0,
    source: normalizePuzzleRatingSource(null),
    updatedAt: null,
  };
};

export const updatePuzzleRating = async (
  puzzleId: number,
  level: PuzzleLevel,
): Promise<PuzzleRating> => {
  const result = await postApi(
    "/api/puzzles/rating",
    { puzzleId, level },
    {
      schema: puzzleRatingResponseSchema,
      errorMessage: "Unable to update puzzle rating.",
      invalidMessage: "Unable to update puzzle rating: the server returned invalid data.",
    },
  );

  if (result.puzzleId !== puzzleId) {
    throw new Error("Unable to update puzzle rating: the server returned the wrong puzzle.");
  }

  return {
    level: normalizePuzzleLevel(result.level),
    rating: result.rating,
    ratingDeviation: result.ratingDeviation,
    attempts: result.attempts,
    successes: result.successes,
    source: result.source,
    updatedAt: result.updatedAt,
  };
};

export const refreshPuzzleRatings = async (): Promise<void> => {
  await postApi(
    "/api/puzzles/rating",
    { action: "refresh" },
    {
      schema: puzzleRatingRefreshResponseSchema,
      errorMessage: "Unable to refresh puzzle ratings.",
      invalidMessage: "Unable to refresh puzzle ratings: the server returned invalid data.",
    },
  );
};
