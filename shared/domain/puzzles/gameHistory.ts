import { INITIAL_FEN, makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import { makeUci } from "chessops/util";

import { createAtomicPosition, parseAtomicMove, splitSolutionMove } from "../chess/pgn";
import { startingFenKey } from "./submissionDuplicates";

export type PuzzleIntro = { beforeFen: string; uci: string; san: string };
export type PuzzleLeadIn = { beforeFen: string; moves: string[] };

export const MAX_BLIND_PUZZLE_PLIES = 50;

type ReplayMatch = {
  moves: string[];
  intro: PuzzleIntro | null;
  leadIn: PuzzleLeadIn | null;
};

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
    const startingFen = beforeFen;
    const matchesTarget = (afterFen: string) => startingFenKey(afterFen) === startingFenKey(target);
    if (matchesTarget(beforeFen) && (!exactEnd || !moves.length)) {
      matches.push({ moves: [], intro: null, leadIn: null, exact: beforeFen === target });
    }

    for (const raw of moves) {
      const token = splitSolutionMove(raw.trim()).san;
      const move = parseAtomicMove(position, token);
      if (!move) {
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
          leadIn: { beforeFen: startingFen, moves: [...played] },
          exact: afterFen === target,
        });
      }
      beforeFen = afterFen;
    }

    const exact = matches.filter((match) => match.exact);
    const match = exact.length === 1 ? exact[0] : matches.length === 1 ? matches[0] : null;
    return match ? { moves: match.moves, intro: match.intro, leadIn: match.leadIn } : null;
  } catch {
    return null;
  }
};

export const puzzleContextFromGameHistory = (row: {
  fen: string;
  game_initial_fen?: string | null;
  position_moves?: string[] | null;
  game_moves?: string[] | null;
}): Pick<ReplayMatch, "intro" | "leadIn"> => {
  const initialFen = row.game_initial_fen || INITIAL_FEN;
  const position = row.position_moves?.length
    ? matchPuzzleGameHistory(row.fen, row.position_moves, initialFen, true)
    : null;
  const match =
    position ??
    (row.game_moves?.length ? matchPuzzleGameHistory(row.fen, row.game_moves, initialFen) : null);
  return { intro: match?.intro ?? null, leadIn: match?.leadIn ?? null };
};

export const rewindPuzzleLeadIn = (
  leadIn: PuzzleLeadIn,
  plies: number | "start",
): PuzzleLeadIn | null => {
  const start = plies === "start" ? 0 : Math.max(0, leadIn.moves.length - plies);
  if (!leadIn.moves.length || (plies !== "start" && plies < 1)) return null;
  try {
    const position = createAtomicPosition(leadIn.beforeFen);
    for (const san of leadIn.moves.slice(0, start)) {
      const move = parseAtomicMove(position, san);
      if (!move) return null;
      position.play(move);
    }
    return { beforeFen: makeFen(position.toSetup()), moves: leadIn.moves.slice(start) };
  } catch {
    return null;
  }
};
