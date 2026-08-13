import { notificationRoute } from "../features/notifications/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(notificationRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to load notifications.",
});
