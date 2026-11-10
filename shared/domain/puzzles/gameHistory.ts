import { INITIAL_FEN, makeFen } from "chessops/fen";
import { makeSan, parseSan } from "chessops/san";
import { makeUci } from "chessops/util";

import { createAtomicPosition, moveFromUci, splitSolutionMove } from "../chess/pgn";
import { startingFenKey } from "./submissionDuplicates";

export type PuzzleIntro = { beforeFen: string; uci: string; san: string };

type ReplayMatch = { moves: string[]; intro: PuzzleIntro | null };

// The current board must agree in pieces, turn, castling and legal en passant.
// Older puzzles sometimes reset their move counters, so use the exact FEN as
// a tiebreaker, but never guess between repeated positions with different intros.
export const matchPuzzleGameHistory = (
  fen: string,
  moves: readonly string[],
  initialFen = INITIAL_FEN,
  exactEnd = false,
): ReplayMatch | null => {
  try {
    const target = makeFen(createAtomicPosition(fen).toSetup());
    const position = createAtomicPosition(initialFen);
    const played: string[] = [];
    const matches: Array<ReplayMatch & { exact: boolean }> = [];
    let beforeFen = makeFen(position.toSetup());
    const matchesTarget = (afterFen: string) => startingFenKey(afterFen) === startingFenKey(target);
    if (matchesTarget(beforeFen) && (!exactEnd || !moves.length)) {
      matches.push({ moves: [], intro: null, exact: beforeFen === target });
    }

    for (const raw of moves) {
      const token = splitSolutionMove(raw.trim()).san;
      const move = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(token)
        ? moveFromUci(position, token)
        : parseSan(position, token);
      if (!move || !position.isLegal(move)) {
        if (exactEnd) return null;
        break;
      }

      const san = makeSan(position, move);
      played.push(san);
      position.play(move);
      const afterFen = makeFen(position.toSetup());
      if (matchesTarget(afterFen) && (!exactEnd || played.length === moves.length)) {
        matches.push({
          moves: [...played],
          intro: { beforeFen, san, uci: makeUci(move) },
          exact: afterFen === target,
        });
      }
      beforeFen = afterFen;
    }

    const exact = matches.filter((match) => match.exact);
    const match = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
    return match ? { moves: match.moves, intro: match.intro } : null;
  } catch {
    return null;
  }
};

export const puzzleContextFromGameHistory = (row: {
  fen: string;
  game_initial_fen?: string | null;
  position_moves?: string[] | null;
  game_moves?: string[] | null;
}): Pick<ReplayMatch, "intro"> => {
  const initialFen = row.game_initial_fen || INITIAL_FEN;
  const position = row.position_moves?.length
    ? matchPuzzleGameHistory(row.fen, row.position_moves, initialFen, true)
    : null;
  const match =
    position ??
    (row.game_moves?.length ? matchPuzzleGameHistory(row.fen, row.game_moves, initialFen) : null);
  return { intro: match?.intro ?? null };
};
