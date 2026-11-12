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
  const index = parseSolutionUciLines(fen, pgn).findIndex((line) => {
    if (line.length < prefix.length) return false;
    const moves = convertUciLineToSan(fen, line.slice(0, prefix.length));
    return prefix.every((move, ply) => sameSolutionMove(move, moves[ply]));
  });
  return Math.max(0, index);
};

export const gamePlyFromHash = (hash: string, moveCount: number, defaultPly = 0): number | null => {
  if (!hash) return Math.min(moveCount, defaultPly);
  const exactPly = /^#ply-(\d+)$/.exec(hash);
  if (exactPly) return Math.min(moveCount, Number(exactPly[1]));
  const match = /^#(\d+)$/.exec(hash);
  if (!match) return null;
  return Math.min(moveCount, Number(match[1]) * 2);
};

export const gameHashForPly = (ply: number): string =>
  ply === 0 ? "" : ply % 2 === 0 ? `#${ply / 2}` : `#ply-${ply}`;

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
