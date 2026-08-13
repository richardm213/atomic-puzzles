import { communityRoute } from "../features/community/routes";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(communityRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to update community discussion.",
});
