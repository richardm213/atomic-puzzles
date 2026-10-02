import { makeSan } from "chessops/san";

import {
  createAtomicPosition,
  moveFromUci,
  parseSolutionUciLines,
  type UciSolutionLine,
} from "./solutionPgn";

export type ServerPuzzleEvaluation = {
  evaluation: "accepted" | "retry" | "wrong";
  solved: boolean;
  opponentMove: string | null;
  moveLabel: string | null;
};

const matchingPrefix = (lines: UciSolutionLine[], moves: string[]): UciSolutionLine[] =>
  lines.filter((line) => moves.every((move, index) => line[index]?.uci === move));

export const evaluatePuzzleMoves = (
  fen: string,
  solution: string,
  rawMoves: string[],
): ServerPuzzleEvaluation => {
  const moves = rawMoves.map((move) => move.trim().toLowerCase());
  if (moves.length === 0) throw new Error("At least one move is required.");

  const lines = parseSolutionUciLines(fen, solution);
  if (lines.length === 0) throw new Error("Puzzle has no playable solution.");

  const priorMoves = moves.slice(0, -1);
  const candidates = matchingPrefix(lines, priorMoves);
  if (candidates.length === 0) throw new Error("Move history does not match this puzzle.");

  const submittedMove = moves.at(-1)!;
  const entries = candidates.flatMap((line) => {
    const entry = line[priorMoves.length];
    return entry?.uci === submittedMove ? [entry] : [];
  });

  const position = createAtomicPosition(fen);
  for (const uci of priorMoves) {
    const move = moveFromUci(position, uci);
    if (!move) throw new Error("Move history contains an illegal move.");
    position.play(move);
  }
  const submitted = moveFromUci(position, submittedMove);
  const moveLabel = submitted ? makeSan(position, submitted) : null;

  if (entries.length === 0) {
    return { evaluation: "wrong", solved: false, opponentMove: null, moveLabel };
  }
  if (!entries.some((entry) => !entry.retry)) {
    return { evaluation: "retry", solved: false, opponentMove: null, moveLabel };
  }

  const acceptedCandidates = candidates.filter(
    (line) => line[priorMoves.length]?.uci === submittedMove && !line[priorMoves.length]?.retry,
  );
  const acceptedLength = moves.length;
  if (acceptedCandidates.some((line) => line.length === acceptedLength)) {
    return { evaluation: "accepted", solved: true, opponentMove: null, moveLabel };
  }

  const opponentMove = acceptedCandidates
    .map((line) => line[acceptedLength])
    .find((entry) => entry && !entry.retry)?.uci;
  if (!opponentMove) {
    return { evaluation: "accepted", solved: true, opponentMove: null, moveLabel };
  }

  const afterOpponentLength = acceptedLength + 1;
  const continued = acceptedCandidates.filter(
    (line) => line[acceptedLength]?.uci === opponentMove,
  );
  return {
    evaluation: "accepted",
    solved: continued.some((line) => line.length === afterOpponentLength),
    opponentMove,
    moveLabel,
  };
};
