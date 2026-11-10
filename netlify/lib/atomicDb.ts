export { fenAfterAtomicMove as fenAfterAtomicDbMove } from "../../shared/domain/puzzles/solutionPgn";

const ATOMIC_DB_QUERY_URL = "https://belzedar.duckdns.org/atomicdb/api/query";
const ATOMIC_DB_PRINCIPAL_VARIATIONS_URL =
  "https://belzedar.duckdns.org/atomicdb/api/principal-variations";
const ATOMIC_DB_REQUEST_URL = "https://belzedar.duckdns.org/atomicdb/api/request";
export const MAX_ATOMIC_DB_FEN_LENGTH = 160;
export const ATOMIC_DB_UCI_PATTERN = /^[a-h][1-8][a-h][1-8][nbrq]?$/;

export type AtomicDbUpstreamPosition = Record<string, unknown> & { moves: unknown[] };

type AtomicDbPrincipalVariations = {
  position: AtomicDbUpstreamPosition;
  lines: Record<string, unknown>;
  positions: Record<string, unknown>;
};

export const isValidAtomicDbFen = (value: unknown): value is string =>
  typeof value === "string" &&
  Boolean(value.trim()) &&
  value.length <= MAX_ATOMIC_DB_FEN_LENGTH &&
  value.trim().split(/\s+/).length >= 4;

export const trimAtomicDbPosition = (position: AtomicDbUpstreamPosition) => {
  const analysis =
    position.analysis && typeof position.analysis === "object"
      ? (position.analysis as { lines?: unknown })
      : null;
  const depthByMove = new Map<string, number>();
  if (Array.isArray(analysis?.lines)) {
    for (const value of analysis.lines) {
      if (!value || typeof value !== "object") continue;
      const line = value as { move?: unknown; depth?: unknown; pv?: unknown };
      const move =
        typeof line.move === "string"
          ? line.move
          : Array.isArray(line.pv) && typeof line.pv[0] === "string"
            ? line.pv[0]
            : "";
      if (ATOMIC_DB_UCI_PATTERN.test(move) && typeof line.depth === "number") {
        depthByMove.set(move, Math.max(0, Math.floor(line.depth)));
      }
    }
  }
  return {
    key: position.key,
    status: position.status,
    closure: position.closure,
    score: position.score,
    point: position.point,
    best_move: position.best_move,
    moves: position.moves.slice(0, 5).map((value) => {
      if (!value || typeof value !== "object") return value;
      const move = value as Record<string, unknown>;
      const uci = typeof move.uci === "string" ? move.uci : "";
      const existingDepth = typeof move.search_depth === "number" ? move.search_depth : null;
      return { ...move, search_depth: depthByMove.get(uci) ?? existingDepth };
    }),
  };
};

export const createAtomicDbQuery = (signal: AbortSignal) => {
  const requests = new Map<string, Promise<AtomicDbUpstreamPosition | null>>();

  return (fen: string): Promise<AtomicDbUpstreamPosition | null> => {
    const existing = requests.get(fen);
    if (existing) return existing;

    const request = (async () => {
      const url = new URL(ATOMIC_DB_QUERY_URL);
      url.searchParams.set("fen", fen);
      const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
      const body: unknown = await response.json().catch(() => null);

      if (response.status === 404) return null;
      if (
        !response.ok ||
        !body ||
        typeof body !== "object" ||
        !Array.isArray((body as { moves?: unknown }).moves)
      ) {
        throw new Error("AtomicDB returned an invalid response.");
      }
      return body as AtomicDbUpstreamPosition;
    })();
    requests.set(fen, request);
    return request;
  };
};

export const queryAtomicDbPrincipalVariations = async (
  fen: string,
  lineCount: number,
  plyCount: number,
  signal: AbortSignal,
  fetchResponse: typeof fetch = fetch,
): Promise<AtomicDbPrincipalVariations | null> => {
  const url = new URL(ATOMIC_DB_PRINCIPAL_VARIATIONS_URL);
  url.searchParams.set("fen", fen);
  url.searchParams.set("line_count", String(lineCount));
  url.searchParams.set("ply_count", String(plyCount));
  const response = await fetchResponse(url, { headers: { Accept: "application/json" }, signal });
  const body: unknown = await response.json().catch(() => null);

  if (response.status === 404) return null;
  if (!response.ok || !body || typeof body !== "object") {
    throw new Error("AtomicDB returned an invalid response.");
  }

  const payload = body as {
    position?: unknown;
    lines?: unknown;
    positions?: unknown;
  };
  if (
    !payload.position ||
    typeof payload.position !== "object" ||
    !Array.isArray((payload.position as { moves?: unknown }).moves) ||
    !payload.lines ||
    typeof payload.lines !== "object" ||
    !payload.positions ||
    typeof payload.positions !== "object"
  ) {
    throw new Error("AtomicDB returned an invalid response.");
  }

  return {
    position: payload.position as AtomicDbUpstreamPosition,
    lines: payload.lines as Record<string, unknown>,
    positions: payload.positions as Record<string, unknown>,
  };
};

export const requestAtomicDbAnalysis = async (fen: string, signal: AbortSignal) => {
  const response = await fetch(ATOMIC_DB_REQUEST_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ fen, only_if_missing: "1" }),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || !body || typeof body !== "object") {
    throw new Error("AtomicDB rejected the analysis request.");
  }
  return body as Record<string, unknown>;
};
