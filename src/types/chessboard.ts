import type { Color } from "chessops";

export type PositionState = {
  fen: string;
  turn: Color | "";
  status: string;
  winner?: Color | undefined;
  error: string;
  lineMoves?: string[];
  view: BoardView;
};

export type BoardLineRef =
  | { source: "history" }
  | { source: "solution"; index: number }
  | { source: "custom"; index: number };

export type BoardView = {
  line: BoardLineRef;
  // Numbered plies start at the puzzle root; the opponent's intro is ungraded.
  position: number | "beforeIntro";
};

export const initialBoardView = (): BoardView => ({ line: { source: "history" }, position: 0 });

export const boardPly = (state: Pick<PositionState, "view"> | null | undefined): number =>
  typeof state?.view?.position === "number" ? state.view.position : 0;

export type VariationState = {
  solutionLines?: string[][];
  customLines?: string[][];
};

export type MoveResultState = {
  // Feedback belongs to a move evaluation; browsing must not emit it again.
  feedback?: "correct" | "wrong" | "retry";
  solved: boolean;
};

export type ChessboardState = PositionState & VariationState & MoveResultState;

export type PlaybackCommand =
  "start" | "previous" | "next" | "end" | "previousOption" | "nextOption";

export type SolutionNavigation =
  | { type: "command"; command: PlaybackCommand }
  | { type: "play"; uci: string }
  | { type: "line"; ucis: string[] }
  | { type: "reset"; fen: string }
  | { type: "loadPgn"; pgn: string; fen?: string; line?: number; ply?: number }
  | { type: "history"; ply: number }
  | {
      type: "annotate";
      source: "history" | "custom";
      line?: number;
      ply: number;
      annotation: string;
    }
  | { type: "solution"; line: number; ply: number }
  | { type: "custom"; line: number; ply: number };

export type AttemptResolved = {
  puzzleId: string | number | null | undefined;
  puzzleCorrect: boolean;
  incorrectMove: string | null;
  correctMove: string | null;
};
