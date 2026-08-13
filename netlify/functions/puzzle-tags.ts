import { puzzleTagRoute } from "../features/puzzles/tags/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(puzzleTagRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to update puzzle motifs.",
});
