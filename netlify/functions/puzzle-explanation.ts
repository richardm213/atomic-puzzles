import { puzzleExplanationRoute } from "../features/puzzles/explanation/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(puzzleExplanationRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to update puzzle explanation.",
});
