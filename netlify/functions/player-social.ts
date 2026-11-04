import { playerSocialRoute } from "../features/playerSocial/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(playerSocialRoute, {
  methods: ["GET", "POST"],
  fallbackMessage: "Unable to load player details.",
});
