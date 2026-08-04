import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import type { Atomic } from "chessops/variant";

import {
  createAtomicPosition,
  moveFromUci,
  type UciSolutionLine,
} from "../../lib/puzzles/solutionPgn";
import { appendBoardMove, type BoardHistory, createBoardHistory } from "./boardHistory";

export type TrainingState = {
  candidates: UciSolutionLine[];
  progress: number;
  solved: boolean;
};

export type TrainingMoveEvaluation = "accepted" | "retry" | "wrong";

export type TrainingMoveResult = TrainingState & {
  evaluation: TrainingMoveEvaluation;
  acceptedState: TrainingState | null;
};

export const hasAcceptedMoveAt = (lines: UciSolutionLine[], progress: number): boolean =>
  lines.some((line) => {
    const entry = line[progress];
    return entry !== undefined && !entry.retry;
  });

export const isSolutionCompleteAt = (lines: UciSolutionLine[], progress: number): boolean =>
  lines.some((line) => line.length === progress) && !hasAcceptedMoveAt(lines, progress);

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

    const matching = candidates.filter((line) => line[progress]?.key === moveKey);
    if (matching.length === 0) break;

    candidates = matching;
    progress += 1;
    solved = isSolutionCompleteAt(candidates, progress);
  }

  return { candidates, progress, solved };
};

export const evaluateTrainingMove = ({
  solutionLines,
  playedMoveKeys,
  moveKey,
}: {
  solutionLines: UciSolutionLine[];
  playedMoveKeys: string[];
  moveKey: string;
}): TrainingMoveResult => {
  const state = recomputeTrainingState({
    isTrainingEnabled: true,
    isAnalysisMode: false,
    playedMoveKeys,
    solutionLines,
  });
  const matchingMoves = state.candidates
    .map((line) => line[state.progress])
    .flatMap((entry) => (entry?.key === moveKey ? [entry] : []));

  if (matchingMoves.some((entry) => !entry.retry)) {
    const acceptedCandidates = state.candidates.filter(
      (line) => line[state.progress]?.key === moveKey,
    );
    const acceptedProgress = state.progress + 1;
    return {
      ...state,
      evaluation: "accepted",
      acceptedState: {
        candidates: acceptedCandidates,
        progress: acceptedProgress,
        solved: isSolutionCompleteAt(acceptedCandidates, acceptedProgress),
      },
    };
  }
  if (matchingMoves.length > 0) {
    return { ...state, evaluation: "retry", acceptedState: null };
  }
  return { ...state, evaluation: "wrong", acceptedState: null };
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
