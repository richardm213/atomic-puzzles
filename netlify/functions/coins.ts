import { coinsRoute } from "../features/coins/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(coinsRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to update coins.",
});
