import { useCallback, useRef } from "react";

import type { UciSolutionLine } from "../../lib/puzzles/solutionPgn";

export type BoardMode = "training" | "evaluating" | "solution" | "analysis";

export const usePuzzleTraining = () => {
  const boardStatusRef = useRef({ mode: "training", locked: false, solved: false });
  const candidateLinesRef = useRef<UciSolutionLine[]>([]);
  const progressRef = useRef(0);
  const evaluationTimerRef = useRef<number | null>(null);

  const cancelEvaluation = useCallback(() => {
    if (evaluationTimerRef.current !== null) window.clearTimeout(evaluationTimerRef.current);
    evaluationTimerRef.current = null;
  }, []);

  const resetTraining = useCallback(
    ({
      mode = "training",
      locked = false,
      solved = false,
      candidates = [],
    }: {
      mode?: BoardMode;
      locked?: boolean;
      solved?: boolean;
      candidates?: UciSolutionLine[];
    } = {}) => {
      boardStatusRef.current = { mode, locked, solved };
      candidateLinesRef.current = candidates;
      progressRef.current = 0;
      cancelEvaluation();
    },
    [cancelEvaluation],
  );

  return {
    boardStatusRef,
    candidateLinesRef,
    progressRef,
    evaluationTimerRef,
    cancelEvaluation,
    resetTraining,
  };
};
