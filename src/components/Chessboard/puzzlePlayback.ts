import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import type { Atomic } from "chessops/variant";
import type { Key } from "@lichess-org/chessground/types";
import {
  createAtomicPosition,
  moveFromUci,
  type UciSolutionLine,
  type UciSolutionEntry,
} from "../../lib/puzzles/solutionPgn";

export type SolutionHistory = {
  fens: string[];
  lastMoves: Array<[Key, Key] | undefined>;
  moveUcis: string[];
  moveKeys: string[];
  moveSans: string[];
};

export type TrainingState = {
  candidates: UciSolutionLine[];
  progress: number;
  solved: boolean;
};

export const hasExpectedMoveAt = (lines: UciSolutionLine[], progress: number): boolean =>
  lines.some((line) => {
    const entry = line[progress];
    return entry !== undefined && !entry.questionable;
  });

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
  let solved = !hasExpectedMoveAt(candidates, progress);

  for (const moveKey of playedMoveKeys) {
    if (solved) continue;

    const matching = candidates.filter((line) => line[progress]?.key === moveKey);
    if (matching.length === 0) break;

    candidates = matching;
    progress += 1;
    solved = !hasExpectedMoveAt(candidates, progress);
  }

  return { candidates, progress, solved };
};

export const buildSolutionHistory = (
  initialFen: string,
  line: UciSolutionLine,
): SolutionHistory | null => {
  const { position } = tryCreateAtomicPosition(initialFen);
  if (!position) return null;

  const fens: string[] = [initialFen];
  const lastMoves: Array<[Key, Key] | undefined> = [undefined];
  const moveUcis: string[] = [];
  const moveSans: string[] = [];
  const moveKeys: string[] = [];

  for (const entry of line as UciSolutionEntry[]) {
    const uci = entry.uci;
    const move = moveFromUci(position, uci);
    if (!move) return null;

    const san = makeSan(position, move);
    position.play(move);
    fens.push(makeFen(position.toSetup()));
    lastMoves.push([uci.slice(0, 2) as Key, uci.slice(2, 4) as Key]);
    moveUcis.push(uci);
    moveKeys.push(entry.key);
    moveSans.push(san);
  }

  return { fens, lastMoves, moveUcis, moveKeys, moveSans };
};
