import { serializeSanLinesToPgn, type UciSolutionLine } from "../chess/pgn";

export const formatPuzzleAttemptPgn = (fen: string, lines: string[][]): string =>
  `[Variant "Atomic"]\n[SetUp "1"]\n[FEN "${fen}"]\n[Result "*"]\n\n${[
    serializeSanLinesToPgn(fen, lines),
    "*",
  ]
    .filter(Boolean)
    .join(" ")}`;

// Retry branches describe mistakes, so only accepted continuations count as choices.
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
        solutionLines.some(
          (line) =>
            line[index] &&
            line[index].key !== move.key &&
            !line.slice(0, index + 1).some((entry) => entry.retry),
        ),
    ),
  );
};
