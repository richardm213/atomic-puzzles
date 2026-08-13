import { puzzleProgressRoute } from "../features/puzzles/progress/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(puzzleProgressRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to record puzzle progress.",
});
