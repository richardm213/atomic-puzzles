import { z } from "zod";

import { postApi } from "../api/postApi";
import type { PuzzleRow } from "../supabase/puzzles";

const puzzleDetailsResponseSchema = z.object({
  puzzles: z.array(z.record(z.string(), z.unknown())),
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
  return result.puzzles;
};
