import { gameAnalysisRoute } from "../features/gameAnalysis/route";
import { defineFunction } from "../platform/defineFunction";

export const handler = defineFunction(gameAnalysisRoute, {
  methods: ["POST"],
  fallbackMessage: "Unable to process game analysis.",
  rateLimit: {
    buckets: [
      { capacity: 12, refillPerSecond: 0.5 },
      { capacity: 80, refillPerSecond: 0.2 },
    ],
    message: "Too many game analysis requests. Please wait and try again.",
  },
});

export const config = { path: "/api/game-analysis" } as const;
