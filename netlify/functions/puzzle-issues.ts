import { puzzleIssueRoute } from "../features/puzzles/issues/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(puzzleIssueRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to manage puzzle issues.",
});
