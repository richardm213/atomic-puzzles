import { makeFen } from "chessops/fen";

import { createAtomicPosition, moveFromUci } from "../../shared/domain/puzzles/solutionPgn";

const ATOMIC_DB_QUERY_URL = "https://belzedar.duckdns.org/atomicdb/api/query";
export const MAX_ATOMIC_DB_FEN_LENGTH = 160;
export const ATOMIC_DB_UCI_PATTERN = /^[a-h][1-8][a-h][1-8][nbrq]?$/;

export type AtomicDbUpstreamPosition = Record<string, unknown> & { moves: unknown[] };

export const isValidAtomicDbFen = (value: unknown): value is string =>
  typeof value === "string" &&
  Boolean(value.trim()) &&
  value.length <= MAX_ATOMIC_DB_FEN_LENGTH &&
  value.trim().split(/\s+/).length >= 4;

export const trimAtomicDbPosition = (position: AtomicDbUpstreamPosition) => ({
  key: position.key,
  status: position.status,
  closure: position.closure,
  score: position.score,
  point: position.point,
  best_move: position.best_move,
  moves: position.moves.slice(0, 5),
});

export const fenAfterAtomicDbMove = (fen: string, uci: string): string | null => {
  try {
    const position = createAtomicPosition(fen);
    const move = moveFromUci(position, uci);
    if (!move || !position.isLegal(move)) return null;
    position.play(move);
    return makeFen(position.toSetup());
  } catch {
    return null;
  }
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
