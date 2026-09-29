import {
  ATOMIC_DB_UCI_PATTERN,
  createAtomicDbQuery,
  fenAfterAtomicDbMove,
  isValidAtomicDbFen,
  trimAtomicDbPosition,
} from "../lib/atomicDb";

type Event = {
  httpMethod?: string;
  body?: string | null;
  queryStringParameters?: Record<string, string | undefined> | null;
};

const MAX_BATCH_POSITIONS = 50;
const MAX_LINES = 5;
const MAX_PLIES = 5;

const json = (statusCode: number, body: unknown, cache = false) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": cache ? "public, max-age=30, stale-while-revalidate=120" : "no-store",
  },
  body: JSON.stringify(body),
});

const parseBatchFens = (bodyText: string | null | undefined): string[] | null => {
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

export const handler = async (event: Event) => {
  const method = event.httpMethod ?? "GET";
  if (method !== "GET" && method !== "POST") return json(405, { error: "Method not allowed" });

  const fen = event.queryStringParameters?.fen?.trim() ?? "";
  const batchFens = method === "POST" ? parseBatchFens(event.body) : null;
  if (method === "POST" && !batchFens) {
    return json(400, { error: `Between 1 and ${MAX_BATCH_POSITIONS} valid FENs are required.` });
  }
  if (method === "GET" && !isValidAtomicDbFen(fen)) {
    return json(400, { error: "A valid FEN is required." });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  const queryPosition = createAtomicDbQuery(controller.signal);

  try {
    if (batchFens) {
      const entries = await Promise.all(
        batchFens.map(async (positionFen) => {
          const position = await queryPosition(positionFen);
          return [positionFen, position ? trimAtomicDbPosition(position) : null] as const;
        }),
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
        return json(400, { error: "Valid line moves and ply count are required." });
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
    if (!position) return json(404, { error: "Position not found in AtomicDB." }, true);
    return json(200, trimAtomicDbPosition(position), true);
  } catch (error: unknown) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return json(timedOut ? 504 : 502, {
      error: timedOut ? "AtomicDB took too long to respond." : "AtomicDB analysis is unavailable.",
    });
  } finally {
    clearTimeout(timeout);
  }
};
