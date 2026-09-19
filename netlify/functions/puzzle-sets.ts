import { puzzleSetsRoute } from "../features/puzzles/customSets/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(puzzleSetsRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to update custom puzzle sets.",
});
