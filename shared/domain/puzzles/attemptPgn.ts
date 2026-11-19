import { serializeSanLinesToPgn, type UciSolutionLine } from "../chess/pgn";

export const formatPuzzleAttemptPgn = (fen: string, lines: string[][]): string =>
  `[Variant "Atomic"]\n[SetUp "1"]\n[FEN "${fen}"]\n[Result "*"]\n\n${[
    serializeSanLinesToPgn(fen, lines),
    "*",
  ]
    .filter(Boolean)
    .join(" ")}`;

// Show the first choice in the solution, or the opening move if the line never branches.
export const correctAttemptMoveIndex = (
  solutionLines: readonly UciSolutionLine[],
  playedLength: number,
): number => {
  const mainLine = solutionLines[0] ?? [];
  return Math.max(
    0,
    mainLine.findIndex(
      (move, index) =>
        index < playedLength &&
        solutionLines.some((line) => line[index] && line[index].key !== move.key),
    ),
  );
};
