import { openingsRoute } from "../features/openings/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(openingsRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to load opening training.",
});
