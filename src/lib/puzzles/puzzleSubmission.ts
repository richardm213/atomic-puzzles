import { INITIAL_FEN } from "chessops/fen";

import type { PuzzleSubmissionValue } from "../../../shared/domain/puzzles/puzzleSubmission";

export * from "../../../shared/domain/puzzles/puzzleSubmission";

export const createEmptyPuzzleSubmission = (): PuzzleSubmissionValue => ({
  fen: INITIAL_FEN,
  solution: "",
  event: "",
  whitePlayer: "",
  blackPlayer: "",
  explanation: "",
  opaStyle: false,
});
