import { ArchiveRequestError, queryArchiveResource } from "../archive/queries";
import { defineFunction, type FunctionEvent } from "../platform/defineFunction";
import { HttpError } from "../platform/errors";
import { jsonResponse } from "../platform/response";

const archiveDataRoute = async (event: FunctionEvent) => {
  const params = new URLSearchParams();
  Object.entries(event.queryStringParameters ?? {}).forEach(([key, value]) => {
    if (value !== undefined) params.append(key, value);
  });
  try {
    return jsonResponse(200, await queryArchiveResource(params), {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    });
  } catch (error) {
    if (error instanceof ArchiveRequestError) {
      throw new HttpError(400, error.message, {}, "invalid_archive_query");
    }
    throw error;
  }
};

export const handler = defineFunction(archiveDataRoute, {
  methods: ["GET"],
  fallbackMessage: "Archive query failed",
  rateLimit: {
    buckets: [
      { capacity: 120, refillPerSecond: 8 },
      { capacity: 1_200, refillPerSecond: 2 },
    ],
    cost: (event) => {
      const params = event.queryStringParameters ?? {};
      const resource = params.resource;
      if (resource === "matches") return params.includeTotal === "false" ? 1 : 4;
      if (resource === "aliases") return params.username || params.query ? 1 : 5;
      if (resource === "player_directory") return 5;
      if (resource === "leaderboard") return params.month || params.username ? 1 : 4;
      return 1;
    },
    message: "Too many archive requests. Please wait and try again.",
  },
});

export const config = {
  path: "/api/archive-data",
  rateLimit: {
    windowLimit: 300,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
} as const;
