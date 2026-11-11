import { serializeSanLinesToPgn, type UciSolutionLine } from "../chess/pgn";

export const formatPuzzleAttemptPgn = (fen: string, lines: string[][]): string =>
  `[Variant "Atomic"]\n[SetUp "1"]\n[FEN "${fen}"]\n[Result "*"]\n\n${[
    serializeSanLinesToPgn(fen, lines),
    "*",
  ]
    .filter(Boolean)
    .join(" ")}`;

// Show the played branch choice; otherwise use the first branching point or opening move.
export const correctAttemptMoveIndex = (
  solutionLines: readonly UciSolutionLine[],
  playedKeys: readonly string[],
): number => {
  const mainLine = solutionLines[0] ?? [];
  const playedBranch = playedKeys.findIndex((key, index) => key !== mainLine[index]?.key);
  return Math.max(
    0,
    playedBranch >= 0
      ? playedBranch
      : mainLine.findIndex((move, index) =>
          solutionLines.some((line) => line[index]?.key !== move.key),
        ),
  );
};
