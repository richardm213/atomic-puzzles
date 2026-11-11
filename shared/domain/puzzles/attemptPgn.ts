import { serializeSanLinesToPgn } from "../chess/pgn";

export const formatPuzzleAttemptPgn = (fen: string, lines: string[][]): string =>
  `[Variant "Atomic"]\n[SetUp "1"]\n[FEN "${fen}"]\n[Result "*"]\n\n${[
    serializeSanLinesToPgn(fen, lines),
    "*",
  ]
    .filter(Boolean)
    .join(" ")}`;
