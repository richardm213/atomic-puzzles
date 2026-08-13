import { puzzleSubmissionRoute } from "../features/puzzles/submission/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(puzzleSubmissionRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to submit puzzle.",
});
