import { authSessionRoute } from "../features/identity/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(authSessionRoute, {
  methods: ["GET", "POST", "DELETE"],
  fallbackMessage: "Unable to register authenticated user.",
});
