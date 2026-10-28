import {
  ATOMIC_DB_UCI_PATTERN,
  createAtomicDbQuery,
  fenAfterAtomicDbMove,
  isValidAtomicDbFen,
  trimAtomicDbPosition,
} from "../lib/atomicDb";
import { requireSameOrigin } from "../platform/authentication";
import { defineFunction, type FunctionEvent } from "../platform/defineFunction";
import { jsonResponse } from "../platform/response";

const MAX_BATCH_POSITIONS = 50;
const MAX_BATCH_CONCURRENCY = 6;
const MAX_BATCH_BODY_BYTES = 16 * 1024;
const MAX_LINES = 5;
const MAX_PLIES = 5;

const json = (statusCode: number, body: unknown, cache = false) => ({
  ...jsonResponse(statusCode, body, {
    "Cache-Control": cache ? "public, max-age=30, stale-while-revalidate=120" : "no-store",
  }),
});

const parseBatchFens = (bodyText: string | null | undefined): string[] | null => {
  if (new TextEncoder().encode(bodyText ?? "").byteLength > MAX_BATCH_BODY_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(bodyText ?? "");
  } catch {
    return null;
  }
  const values = (body as { fens?: unknown } | null)?.fens;
  if (
    !Array.isArray(values) ||
    values.length === 0 ||
    values.length > MAX_BATCH_POSITIONS ||
    values.some((value) => !isValidAtomicDbFen(value))
  ) {
    return null;
  }
  return [...new Set(values.map((value) => String(value).trim()))];
};

const mapWithConcurrency = async <Value, Result>(
  values: Value[],
  concurrency: number,
  iteratee: (value: Value) => Promise<Result>,
): Promise<Result[]> => {
  const results = new Array<Result>(values.length);
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await iteratee(values[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
};

const atomicDbAnalysisRoute = async (event: FunctionEvent) => {
  const method = event.httpMethod ?? "GET";
  if (method === "POST") {
    requireSameOrigin(event.headers, "Cross-site AtomicDB requests are not allowed.");
  }

  const fen = event.queryStringParameters?.fen?.trim() ?? "";
  const batchFens = method === "POST" ? parseBatchFens(event.body) : null;
  if (method === "POST" && !batchFens) {
    return json(400, {
      error: `Between 1 and ${MAX_BATCH_POSITIONS} valid FENs are required.`,
      code: "validation_failed",
    });
  }
  if (method === "GET" && !isValidAtomicDbFen(fen)) {
    return json(400, { error: "A valid FEN is required.", code: "validation_failed" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const queryPosition = createAtomicDbQuery(controller.signal);

  try {
    if (batchFens) {
      const entries = await mapWithConcurrency(
        batchFens,
        MAX_BATCH_CONCURRENCY,
        async (positionFen) => {
          const position = await queryPosition(positionFen);
          return [positionFen, position ? trimAtomicDbPosition(position) : null] as const;
        },
      );
      return json(200, { positions: Object.fromEntries(entries) });
    }

    const rootMoves = (event.queryStringParameters?.line_moves ?? "").split(",").filter(Boolean);
    if (rootMoves.length > 0) {
      const plyCount = Number(event.queryStringParameters?.plies ?? MAX_PLIES);
      if (
        rootMoves.length > MAX_LINES ||
        rootMoves.some((move) => !ATOMIC_DB_UCI_PATTERN.test(move)) ||
        !Number.isInteger(plyCount) ||
        plyCount < 1 ||
        plyCount > MAX_PLIES
      ) {
        return json(400, {
          error: "Valid line moves and ply count are required.",
          code: "validation_failed",
        });
      }

      const positions: Record<string, ReturnType<typeof trimAtomicDbPosition>> = {};
      const lineEntries = await Promise.all(
        rootMoves.map(async (rootMove) => {
          const moves = [rootMove];
          let currentFen = fenAfterAtomicDbMove(fen, rootMove);
          try {
            while (currentFen && moves.length < plyCount) {
              const position = await queryPosition(currentFen);
              if (!position) break;
              positions[currentFen] = trimAtomicDbPosition(position);

              const bestMove = typeof position.best_move === "string" ? position.best_move : null;
              if (!bestMove || !ATOMIC_DB_UCI_PATTERN.test(bestMove)) break;
              currentFen = fenAfterAtomicDbMove(currentFen, bestMove);
              if (currentFen) moves.push(bestMove);
            }
          } catch (error: unknown) {
            if (error instanceof Error && error.name === "AbortError") throw error;
            // Preserve the completed portion of this branch if only one continuation fails.
          }
          return [rootMove, moves] as const;
        }),
      );
      return json(200, { lines: Object.fromEntries(lineEntries), positions }, true);
    }

    const position = await queryPosition(fen);
    if (!position) {
      return json(
        404,
        { error: "Position not found in AtomicDB.", code: "position_not_found" },
        true,
      );
    }
    return json(200, trimAtomicDbPosition(position), true);
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return json(timedOut ? 504 : 502, {
      error: timedOut ? "AtomicDB took too long to respond." : "AtomicDB analysis is unavailable.",
      code: timedOut ? "upstream_timeout" : "upstream_unavailable",
    });
  } finally {
    clearTimeout(timeout);
  }
};

export const handler = defineFunction(atomicDbAnalysisRoute, {
  methods: ["GET", "POST"],
  fallbackMessage: "AtomicDB analysis is unavailable.",
  rateLimit: {
    buckets: [
      { capacity: 20, refillPerSecond: 2 },
      { capacity: 300, refillPerSecond: 0.5 },
    ],
    cost: (event) => {
      if (event.httpMethod === "POST") {
        try {
          const fens = (JSON.parse(event.body ?? "") as { fens?: unknown }).fens;
          return Array.isArray(fens) ? 1 + Math.ceil(fens.length / 5) : 1;
        } catch {
          return 1;
        }
      }
      const lines = event.queryStringParameters?.line_moves?.split(",").filter(Boolean).length ?? 0;
      return Math.max(1, lines);
    },
    message: "Too many AtomicDB requests. Please wait and try again.",
  },
});

// Netlify's edge limiter is distributed across function instances. The
// application limiter above responds immediately and adds cost weighting.
export const config = {
  path: "/api/atomicdb-analysis",
  rateLimit: {
    windowLimit: 60,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
} as const;
