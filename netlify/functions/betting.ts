import { bettingRoute } from "../features/betting/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(bettingRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to update tournament bets.",
});
