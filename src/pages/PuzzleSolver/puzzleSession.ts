import type { ChessboardState } from "../../types/chessboard";

export type CompletionFeedback = {
  type: "correct" | "retrySuccess" | "wrong" | "retry";
  icon: string;
  title: string;
};

// Saved history is an input, never the result of the current visit.
export type PuzzleSessionState = {
  attempt: "unresolved" | "wrong" | "solved";
  solutionRevealed: boolean;
  feedback: CompletionFeedback | null;
};

export type PuzzleSessionAction =
  | { type: "reset" }
  | { type: "attempt-resolved"; correct: boolean }
  | { type: "reveal-solution" }
  | { type: "board-feedback"; feedback: CompletionFeedback | null };

export const createInitialPuzzleSession = (): PuzzleSessionState => ({
  attempt: "unresolved",
  solutionRevealed: false,
  feedback: null,
});

export const isPuzzleSessionInAnalysis = (state: PuzzleSessionState): boolean =>
  state.attempt === "solved" || state.solutionRevealed;

export const getPuzzleSessionAccess = (
  state: PuzzleSessionState,
  resumedMisses: number,
  retryMovePending: boolean,
  previouslySolved = false,
) => {
  const analysis = isPuzzleSessionInAnalysis(state);
  const hasAttempted =
    state.attempt !== "unresolved" || state.solutionRevealed || resumedMisses > 0;
  return {
    analysis,
    hasAttempted,
    canGiveUp:
      !analysis &&
      (previouslySolved || (!retryMovePending && (state.attempt === "wrong" || resumedMisses > 0))),
    canViewSolution: hasAttempted && !retryMovePending,
  };
};

export const puzzleSessionReducer = (
  state: PuzzleSessionState,
  action: PuzzleSessionAction,
): PuzzleSessionState => {
  switch (action.type) {
    case "reset":
      return createInitialPuzzleSession();
    case "attempt-resolved":
      // Once in analysis, late board events cannot change the visit's outcome.
      if (isPuzzleSessionInAnalysis(state)) return state;
      return {
        attempt: action.correct ? "solved" : "wrong",
        solutionRevealed: action.correct,
        feedback: null,
      };
    case "reveal-solution":
      return { ...state, solutionRevealed: true };
    case "board-feedback":
      return state.feedback === action.feedback ? state : { ...state, feedback: action.feedback };
  }
};

export const buildCompletionFeedback = (
  nextBoardState: ChessboardState,
  hadWrongAttempt: boolean,
): CompletionFeedback | null => {
  if (nextBoardState.feedback === "correct") {
    return hadWrongAttempt
      ? { type: "retrySuccess", icon: "↺", title: "Correct" }
      : { type: "correct", icon: "✓", title: "Correct" };
  }
  if (nextBoardState.feedback === "wrong") {
    return { type: "wrong", icon: "×", title: "Incorrect" };
  }
  if (nextBoardState.feedback === "retry") {
    return { type: "retry", icon: "↺", title: "Try again: better move" };
  }
  return null;
};
