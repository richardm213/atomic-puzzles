import { puzzlePlayRoute } from "../features/puzzles/play/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(puzzlePlayRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to load puzzle.",
});
