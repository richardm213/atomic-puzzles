import { z } from "zod";

export const puzzleAttemptColorSchema = z.enum([
  "green",
  "yellow",
  "orange",
  "red",
  "purple",
  "blue",
]);
export type PuzzleAttemptColor = z.infer<typeof puzzleAttemptColorSchema>;

export const puzzleGradingStateSchema = z.object({
  runId: z.uuid().nullable(),
  graded: z.boolean(),
  availableAt: z.string().nullable(),
  permanent: z.boolean(),
  hasAttempted: z.boolean(),
  hasSolved: z.boolean(),
  misses: z.number().int().nonnegative(),
  color: puzzleAttemptColorSchema.nullable(),
});
export type PuzzleGradingState = z.infer<typeof puzzleGradingStateSchema>;

export const puzzleAttemptColorExplanation = (color: PuzzleAttemptColor): string => {
  switch (color) {
    case "green":
      return "Solved on the first try";
    case "yellow":
      return "Solved on the second try";
    case "orange":
      return "Solved on the third try";
    case "red":
      return "Solved after three or more mistakes, or unsolved after one or two mistakes";
    case "purple":
      return "Unsolved after three or more mistakes";
    case "blue":
      return "Two consecutive correct graded runs without a mistake";
  }
};

export const puzzleGradingLabel = (state: PuzzleGradingState, now = Date.now()): string => {
  if (state.graded) return "Graded";
  if (state.permanent) return "Ungraded";
  const remaining = Date.parse(state.availableAt ?? "") - now;
  if (!Number.isFinite(remaining) || remaining <= 0) return state.runId ? "Ungraded" : "Graded";
  const months = Math.max(0.1, remaining / (30.4375 * 24 * 60 * 60 * 1000));
  return `Grading returns in ${months.toFixed(1)} months`;
};
