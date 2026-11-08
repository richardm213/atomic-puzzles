import { puzzleTagRoute } from "../features/puzzles/tags/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(puzzleTagRoute, {
  methods: ["GET", "POST"],
  fallbackMessage: "Unable to load or update puzzle tag votes.",
});
