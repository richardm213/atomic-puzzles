import { badgesRoute } from "../features/badges/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(badgesRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to load achievements.",
  rateLimit: {
    buckets: [
      { capacity: 20, refillPerSecond: 1 },
      { capacity: 180, refillPerSecond: 0.3 },
    ],
    cost: 3,
    message: "Too many achievement requests. Please wait and try again.",
  },
});
