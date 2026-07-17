import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import type { Atomic } from "chessops/variant";

import {
  createAtomicPosition,
  moveFromUci,
  type UciSolutionEntry,
  type UciSolutionLine,
} from "../../lib/puzzles/solutionPgn";
import { appendBoardMove, type BoardHistory, createBoardHistory } from "./boardHistory";

export type TrainingState = {
  candidates: UciSolutionLine[];
  progress: number;
  solved: boolean;
};

export type TrainingMoveEvaluation = "accepted" | "retry" | "wrong";

export const hasExpectedMoveAt = (lines: UciSolutionLine[], progress: number): boolean =>
  lines.some((line) => {
    const entry = line[progress];
    return entry !== undefined && !entry.questionable;
  });

export const evaluateTrainingMove = ({
  candidates,
  progress,
  moveKey,
}: {
  candidates: UciSolutionLine[];
  progress: number;
  moveKey: string;
}): TrainingMoveEvaluation => {
  let sawRetryMove = false;

  for (const line of candidates) {
    const entry = line[progress];
    if (!entry || entry.key !== moveKey) continue;
    if (!entry.questionable) return "accepted";
    sawRetryMove = true;
  }

  return sawRetryMove ? "retry" : "wrong";
};

export const tryCreateAtomicPosition = (
  fen: string,
): { position: Atomic | null; error: string } => {
  try {
    return {
      position: createAtomicPosition(fen),
      error: "",
    };
  } catch (error) {
    return {
      position: null,
      error: error instanceof Error ? error.message : "Invalid position",
    };
  }
};

export const recomputeTrainingState = ({
  isTrainingEnabled,
  isAnalysisMode,
  playedMoveKeys,
  solutionLines,
}: {
  isTrainingEnabled: boolean;
  isAnalysisMode: boolean;
  playedMoveKeys: string[];
  solutionLines: UciSolutionLine[];
}): TrainingState => {
  if (!isTrainingEnabled || isAnalysisMode) {
    return {
      candidates: [],
      progress: 0,
      solved: false,
    };
  }

  let candidates = solutionLines;
  let progress = 0;
  let solved = false;

  for (const moveKey of playedMoveKeys) {
    if (solved) break;

    let matchedEntry: UciSolutionEntry | undefined;
    const matching = candidates.filter((line) => {
      const entry = line[progress];
      const matches = entry?.key === moveKey;
      if (matches && !matchedEntry) matchedEntry = entry;
      return matches;
    });
    if (matching.length === 0) break;

    candidates = matching;
    progress += 1;
    solved = !matchedEntry?.questionable && !hasExpectedMoveAt(candidates, progress);
  }

  return { candidates, progress, solved };
};

export const buildSolutionHistory = (
  initialFen: string,
  line: UciSolutionLine,
): BoardHistory | null => {
  const { position } = tryCreateAtomicPosition(initialFen);
  if (!position) return null;

  const history = createBoardHistory(initialFen);

  for (const entry of line) {
    const uci = entry.uci;
    const move = moveFromUci(position, uci);
    if (!move) return null;

    const san = makeSan(position, move);
    position.play(move);
    appendBoardMove(history, {
      fen: makeFen(position.toSetup()),
      lastMove: [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key],
      uci,
      key: entry.key,
      san,
    });
  }

  return history;
};
import type { Key } from "@lichess-org/chessground/types";
