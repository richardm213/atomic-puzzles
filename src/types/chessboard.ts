import type { Color } from "chessops";

export type ChessboardState = {
  fen: string;
  turn: Color | "";
  status: string;
  winner?: Color | undefined;
  error: string;
  line?: string;
  lineMoves?: string[];
  solutionLines?: string[][];
  solutionLineIndex?: number;
  lineIndex?: number;
  viewingSolution?: boolean;
  showWrongMove: boolean;
  showRetryMove?: boolean;
  solved: boolean;
};

export type SolutionNavigation = {
  command?: "start" | "previous" | "next" | "end";
  playUci?: string;
  resetFen?: string;
  loadPgn?: string;
  loadPgnFen?: string;
  useHistory?: boolean;
  plyIndex?: number;
  lineIndex?: number;
};

export type AttemptResolved = {
  puzzleId: string | number | null | undefined;
  puzzleCorrect: boolean;
};
