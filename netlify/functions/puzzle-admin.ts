import { puzzleAdminRoute } from "../features/puzzles/admin/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(puzzleAdminRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to administer puzzle.",
});
