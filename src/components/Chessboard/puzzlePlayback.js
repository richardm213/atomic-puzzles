import { makeFen } from "chessops/fen";
import { makeSan } from "chessops/san";
import { createAtomicPosition, moveFromUci } from "../../lib/puzzles/solutionPgn";

export const hasExpectedMoveAt = (lines, progress) =>
  lines.some((line) => line[progress] && !line[progress].questionable);

export const tryCreateAtomicPosition = (fen) => {
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
}) => {
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

export const buildSolutionHistory = (initialFen, line) => {
  const { position } = tryCreateAtomicPosition(initialFen);
  if (!position) return null;

  const fens = [initialFen];
  const lastMoves = [undefined];
  const moveUcis = [];
  const moveSans = [];
  const moveKeys = [];

  for (const entry of line) {
    const uci = entry.uci;
    const move = moveFromUci(position, uci);
    if (!move) return null;

    const san = makeSan(position, move);
    position.play(move);
    fens.push(makeFen(position.toSetup()));
    lastMoves.push([uci.slice(0, 2), uci.slice(2, 4)]);
    moveUcis.push(uci);
    moveKeys.push(entry.key);
    moveSans.push(san);
  }

  return { fens, lastMoves, moveUcis, moveKeys, moveSans };
};
