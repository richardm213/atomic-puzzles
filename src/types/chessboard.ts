import type { Color } from "chessops";

export type PositionState = {
  fen: string;
  turn: Color | "";
  status: string;
  winner?: Color | undefined;
  error: string;
  lineMoves?: string[];
  lineIndex?: number;
};

export type VariationState = {
  solutionLines?: string[][];
  customLines?: string[][];
  solutionLineIndex?: number;
  customLineIndex?: number;
  viewingSolution?: boolean;
};

export type TrainingState = {
  showWrongMove: boolean;
  showRetryMove?: boolean;
  solved: boolean;
};

export type ChessboardState = PositionState & VariationState & TrainingState;

export type PlaybackCommand =
  "start" | "previous" | "next" | "end" | "previousOption" | "nextOption";

export type SolutionNavigation =
  | { type: "command"; command: PlaybackCommand }
  | { type: "play"; uci: string }
  | { type: "reset"; fen: string }
  | { type: "loadPgn"; pgn: string; fen?: string }
  | { type: "history"; ply: number }
  | { type: "solution"; line: number; ply: number }
  | { type: "custom"; line: number; ply: number };

export type AttemptResolved = {
  puzzleId: string | number | null | undefined;
  puzzleCorrect: boolean;
  incorrectMove: string | null;
  correctMove: string | null;
};
