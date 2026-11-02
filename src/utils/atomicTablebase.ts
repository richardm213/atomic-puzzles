import {
  loadAtomicTablebaseMainline,
  probeAtomicTablebase,
  type TablebaseCategory,
  tablebaseSideIsLosing,
  tablebaseSideIsWinning,
} from "../lib/atomicTablebase/lichessAtomicTablebase";
import { type AtomicDbPosition, parseAtomicDbResponse } from "./atomicDb";

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

const isLockedQueenPawnsEnding = (fen: string): boolean => {
  const board = fen.trim().split(/\s+/)[0] ?? "";
  const pieces: Array<{ piece: string; file: number; rank: number }> = [];

  board.split("/").forEach((row, rowIndex) => {
    let file = 0;
    for (const character of row) {
      if (/\d/.test(character)) {
        file += Number(character);
      } else {
        pieces.push({ piece: character, file, rank: 8 - rowIndex });
        file += 1;
      }
    }
  });

  if (pieces.length !== 5) return false;
  const material = pieces
    .map(({ piece }) => piece)
    .sort()
    .join("");
  if (material !== "KPQkp" && material !== "KPkpq") return false;

  const whitePawn = pieces.find(({ piece }) => piece === "P");
  const blackPawn = pieces.find(({ piece }) => piece === "p");
  return Boolean(
    whitePawn &&
    blackPawn &&
    whitePawn.file === blackPawn.file &&
    Math.abs(whitePawn.rank - blackPawn.rank) === 1,
  );
};

const absoluteOutcome = (
  category: TablebaseCategory,
  sideToMove: "white" | "black",
): "WHITE_WIN" | "BLACK_WIN" | "DRAW" | "UNKNOWN" => {
  if (category === "draw") return "DRAW";
  if (!tablebaseSideIsWinning(category) && !tablebaseSideIsLosing(category)) return "UNKNOWN";
  const winner = tablebaseSideIsWinning(category)
    ? sideToMove
    : sideToMove === "white"
      ? "black"
      : "white";
  return winner === "white" ? "WHITE_WIN" : "BLACK_WIN";
};

export const fetchAtomicTablebase = async (
  fen: string,
  signal?: AbortSignal,
): Promise<AtomicTablebaseResult | null> => {
  try {
    const probe = await probeAtomicTablebase(fen, signal);
    const sideToMove = fen.trim().split(/\s+/)[1] === "b" ? "black" : "white";
    const opponent = sideToMove === "white" ? "black" : "white";
    const dtzIsMateDistance = isLockedQueenPawnsEnding(fen);
    const moves = probe.moves.slice(0, 5).map((move) => ({
      uci: move.uci,
      status: absoluteOutcome(move.category, opponent),
      closure: move.category,
      score: null,
      point: null,
      mate:
        move.dtm !== null && move.dtm !== undefined
          ? Math.sign(-move.dtm) * Math.ceil(Math.abs(move.dtm) / 2)
          : dtzIsMateDistance && move.zeroing === false && move.dtz !== null
            ? (tablebaseSideIsLosing(move.category)
                ? 1
                : tablebaseSideIsWinning(move.category)
                  ? -1
                  : 0) * Math.ceil((Math.abs(move.dtz) + 1) / 2)
            : null,
      backed_plies: 0,
    }));
    const bestMove = moves[0]?.uci ?? null;
    let bestLine = bestMove ? [bestMove] : [];
    if (bestMove) {
      try {
        const mainline = await loadAtomicTablebaseMainline(fen, signal);
        if (mainline.mainline[0]?.uci === bestMove) {
          const fullLine = mainline.mainline.map(({ uci }) => uci);
          bestLine = fullLine.slice(0, 5);
          const winner =
            mainline.winner === "w" ? "white" : mainline.winner === "b" ? "black" : null;
          if (winner && fullLine.length > 0 && moves[0]) {
            const signedMate = (winner === sideToMove ? 1 : -1) * Math.ceil(fullLine.length / 2);
            moves[0].mate = signedMate;

            // If the root mainline proves this DTZ layer terminates in mate, equivalent
            // non-zeroing moves on that layer have the same remaining mate distance.
            const rootDtzReachesMate = Math.abs(probe.dtz ?? 0) === fullLine.length;
            const bestCategory = probe.moves[0]?.category;
            if (rootDtzReachesMate && bestCategory) {
              probe.moves.slice(1, moves.length).forEach((move, offset) => {
                const normalizedMove = moves[offset + 1];
                if (
                  normalizedMove &&
                  move.zeroing === false &&
                  move.category === bestCategory &&
                  move.dtz !== null &&
                  Math.abs(move.dtz) + 1 === fullLine.length
                ) {
                  normalizedMove.mate = signedMate;
                }
              });
            }
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.message.includes("returned 429")) throw error;
        // WDL remains exact when the optional DTZ mainline is otherwise unavailable.
      }
    }

    return {
      position: parseAtomicDbResponse({
        key: null,
        status: absoluteOutcome(probe.category, sideToMove),
        closure: "lichess-atomic-tablebase",
        score: null,
        point: null,
        best_move: bestMove,
        moves,
      }),
      principalVariations: Object.fromEntries(
        moves.map((move) => [move.uci, move.uci === bestMove ? bestLine : [move.uci]]),
      ),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("returned 404")) return null;
    throw error;
  }
};
