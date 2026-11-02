import { ApiError, apiRequest } from "../lib/api/postApi";
import { parseAtomicDbResponse, type AtomicDbPosition } from "./atomicDb";

export const MAX_ATOMIC_TABLEBASE_PIECES = 6;

export type AtomicTablebaseResult = {
  position: AtomicDbPosition;
  principalVariations: Record<string, string[]>;
};

export const isAtomicTablebaseFen = (fen: string): boolean => {
  const board = fen.trim().split(/\s+/)[0] ?? "";
  const pieceCount = [...board].filter((character) => /[a-z]/i.test(character)).length;
  return pieceCount <= MAX_ATOMIC_TABLEBASE_PIECES;
};

export const fetchAtomicTablebase = async (
  fen: string,
  signal?: AbortSignal,
): Promise<AtomicTablebaseResult | null> => {
  const params = new URLSearchParams({ fen });
  try {
    const body = await apiRequest<unknown>(`/api/atomic-tablebase?${params.toString()}`, {
      errorMessage: "Atomic tablebase analysis is unavailable.",
      invalidMessage: "The atomic tablebase returned an unexpected response.",
      ...(signal ? { signal } : {}),
    });
    const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    if (!payload?.position || typeof payload.lines !== "object" || payload.lines === null) {
      throw new Error("The atomic tablebase returned an unexpected response.");
    }
    const principalVariations: Record<string, string[]> = {};
    for (const [move, line] of Object.entries(payload.lines as Record<string, unknown>)) {
      if (!Array.isArray(line)) continue;
      principalVariations[move] = line.filter(
        (uci): uci is string =>
          typeof uci === "string" && /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(uci),
      );
    }
    return { position: parseAtomicDbResponse(payload.position), principalVariations };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
};
