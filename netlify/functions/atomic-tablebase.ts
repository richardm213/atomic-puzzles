import { isAtomicTablebaseFen, queryAtomicTablebase } from "../lib/atomicTablebase";
import { defineFunction, type FunctionEvent } from "../platform/defineFunction";
import { jsonResponse } from "../platform/response";

const json = (statusCode: number, body: unknown, cache = false) =>
  jsonResponse(statusCode, body, {
    "Cache-Control": cache ? "public, max-age=300, stale-while-revalidate=3600" : "no-store",
  });

const atomicTablebaseRoute = async (event: FunctionEvent) => {
  const fen = event.queryStringParameters?.fen?.trim() ?? "";
  if (!isAtomicTablebaseFen(fen)) {
    return json(400, {
      error: "A valid atomic FEN with no more than 6 pieces is required.",
      code: "validation_failed",
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const result = await queryAtomicTablebase(fen, controller.signal);
    return result
      ? json(200, result, true)
      : json(
          404,
          { error: "Position not found in the atomic tablebase.", code: "position_not_found" },
          true,
        );
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return json(timedOut ? 504 : 502, {
      error: timedOut
        ? "The atomic tablebase took too long to respond."
        : "The atomic tablebase is unavailable.",
      code: timedOut ? "upstream_timeout" : "upstream_unavailable",
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const handler = defineFunction(atomicTablebaseRoute, {
  methods: ["GET"],
  fallbackMessage: "The atomic tablebase is unavailable.",
  rateLimit: {
    buckets: [
      { capacity: 30, refillPerSecond: 3 },
      { capacity: 300, refillPerSecond: 0.5 },
    ],
    message: "Too many tablebase requests. Please wait and try again.",
  },
});

export const config = {
  path: "/api/atomic-tablebase",
  rateLimit: {
    windowLimit: 90,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
} as const;
