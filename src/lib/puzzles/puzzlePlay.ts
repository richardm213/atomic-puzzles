import { z } from "zod";

import {
  DAILY_PUZZLE_ATTEMPT_LIMIT_CODE,
  DAILY_PUZZLE_LOAD_BLOCKED_MESSAGE,
} from "../../../shared/domain/puzzles/dailyAttemptLimit";
import { ApiError, postApi } from "../api/postApi";
import type { PuzzleRow } from "../supabase/puzzles";

const puzzleDetailsResponseSchema = z.object({
  puzzles: z.array(z.record(z.string(), z.unknown())),
  blockedPuzzleIds: z.array(z.number()).optional().default([]),
  dailyLimitReached: z.boolean().optional().default(false),
});

export const fetchPuzzleDetails = async (
  puzzleIds: Array<number | string>,
): Promise<PuzzleRow[]> => {
  const result = await postApi(
    "/api/puzzles/play",
    { puzzleIds },
    {
      schema: puzzleDetailsResponseSchema,
      errorMessage: "Unable to load puzzle data.",
      invalidMessage: "The puzzle service returned invalid data.",
    },
  );
  if (result.dailyLimitReached && result.puzzles.length === 0) {
    throw new ApiError(
      DAILY_PUZZLE_LOAD_BLOCKED_MESSAGE,
      429,
      DAILY_PUZZLE_ATTEMPT_LIMIT_CODE,
      "",
      { blockedPuzzleIds: result.blockedPuzzleIds },
    );
  }
  return result.puzzles;
};
