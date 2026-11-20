import type { SolutionNavigation } from "../../types/chessboard";
import {
  convertUciLineToSan,
  parseSolutionUciLines,
  sameSolutionMove,
  serializeSanLinesToPgn,
  serializeUciLinesToPgn,
} from "../chess/pgn";

type BoardLoadSource = {
  fen: string;
  moves?: string[];
  pgn?: string;
  line?: number;
  ply?: number;
};

const pgnFromMoves = (fen: string, moves: string[]): string =>
  serializeUciLinesToPgn(fen, [
    moves.map((uci) => ({ uci, key: uci, annotation: "", retry: false })),
  ]);

export const buildBoardLoadNavigation = ({
  fen,
  moves = [],
  pgn = "",
  line,
  ply,
}: BoardLoadSource): SolutionNavigation => {
  const resolvedPgn = pgn.trim() || (moves.length > 0 ? pgnFromMoves(fen, moves) : "");
  if (!resolvedPgn) return { type: "reset", fen };

  return {
    type: "loadPgn",
    pgn: resolvedPgn,
    fen,
    ...(line === undefined ? {} : { line }),
    ...(ply === undefined ? {} : { ply }),
  };
};

// Rewriting the PGN can reorder its variations. Match the retained moves, not
// the line's index before serialization, to return to the same board position.
export const pgnLineIndexForPrefix = (fen: string, pgn: string, prefix: string[]): number => {
  if (prefix.length === 0) return 0;
  let fallback: number | undefined;
  for (const [index, line] of parseSolutionUciLines(fen, pgn).entries()) {
    if (line.length < prefix.length) continue;
    const moves = convertUciLineToSan(fen, line.slice(0, prefix.length));
    if (prefix.every((move, ply) => move === moves[ply])) return index;
    if (fallback === undefined && prefix.every((move, ply) => sameSolutionMove(move, moves[ply]))) {
      fallback = index;
    }
  }
  return fallback ?? 0;
};

export const gamePlyFromHash = (hash: string, moveCount: number, defaultPly = 0): number | null => {
  if (!hash) return Math.min(moveCount, defaultPly);
  const match = /^#(\d+)$/.exec(hash);
  if (!match) return null;
  return Math.min(moveCount, Number(match[1]));
};

// Game moves take priority over the edited PGN. A diverging analysis branch
// has no continuation in the original game, so leave that draft empty.
export const puzzlePrefillPgn = ({
  rootFen,
  fen,
  gameMoves,
  lineMoves,
  currentMoves,
  moveCount,
}: {
  rootFen: string;
  fen: string;
  gameMoves?: string[];
  lineMoves: string[];
  currentMoves: string[];
  moveCount: number;
}): string => {
  const source = gameMoves?.length
    ? convertUciLineToSan(
        rootFen,
        gameMoves.map((uci) => ({ uci, key: uci, annotation: "", retry: false })),
      )
    : lineMoves;
  if (!currentMoves.every((move, index) => sameSolutionMove(move, source[index]))) return "";
  return serializeSanLinesToPgn(fen, [
    source.slice(currentMoves.length, currentMoves.length + moveCount * 2),
  ]);
};
