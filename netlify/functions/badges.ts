import { badgesRoute } from "../features/badges/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(badgesRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to load achievements.",
});
