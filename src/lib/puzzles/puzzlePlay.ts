import { z } from "zod";

import { postApi } from "../api/postApi";
import type { PuzzleRow } from "../supabase/puzzles";

const evaluationSchema = z.object({
  evaluation: z.enum(["accepted", "retry", "wrong"]),
  solved: z.boolean(),
  opponentMove: z.string().nullable(),
  moveLabel: z.string().nullable(),
  solution: z.string().nullable(),
});

export type PuzzleMoveEvaluation = z.infer<typeof evaluationSchema>;

export const fetchPuzzleDetails = async (puzzleIds: Array<number | string>): Promise<PuzzleRow[]> => {
  const result = await postApi(
    "/api/puzzles/play",
    { action: "details", puzzleIds },
    {
      schema: z.object({ puzzles: z.array(z.record(z.string(), z.unknown())) }),
      errorMessage: "Unable to load puzzle data.",
      invalidMessage: "The puzzle service returned invalid data.",
    },
  );
  return result.puzzles;
};

export const evaluatePuzzleMove = (
  puzzleId: string | number,
  moves: string[],
): Promise<PuzzleMoveEvaluation> =>
  postApi(
    "/api/puzzles/play",
    { action: "evaluate", puzzleId, moves },
    {
      schema: evaluationSchema,
      errorMessage: "Unable to check that move.",
      invalidMessage: "The puzzle service returned invalid move data.",
    },
  );

export const revealPuzzleSolution = async (puzzleId: string | number): Promise<string> => {
  const result = await postApi(
    "/api/puzzles/play",
    { action: "reveal", puzzleId },
    {
      schema: z.object({ solution: z.string().min(1) }),
      errorMessage: "Unable to reveal the solution.",
    },
  );
  return result.solution;
};
