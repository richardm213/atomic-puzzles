import { puzzleRatingRoute } from "../features/puzzles/rating/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(puzzleRatingRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to update puzzle rating.",
});
