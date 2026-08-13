import { puzzleReviewRoute } from "../features/puzzles/review/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(puzzleReviewRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to review puzzle.",
});
