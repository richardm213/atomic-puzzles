import { INITIAL_FEN } from "chessops/fen";

import type {
  PuzzlePositionHistory,
  PuzzleSubmissionValue,
} from "../../../shared/domain/puzzles/puzzleSubmission";

export * from "../../../shared/domain/puzzles/puzzleSubmission";

export type PuzzleCreationResult =
  { destination: "published"; puzzleId: number } | { destination: "review" };

export type BoardPuzzleDraft = {
  fen: string;
  orientation: "white" | "black";
  sourcePly: number;
  positionHistory: PuzzlePositionHistory;
};

export const createEmptyPuzzleSubmission = (): PuzzleSubmissionValue => ({
  fen: INITIAL_FEN,
  solution: "",
  event: "",
  whitePlayer: "",
  blackPlayer: "",
  explanation: "",
  opaStyle: false,
  tags: [],
});
