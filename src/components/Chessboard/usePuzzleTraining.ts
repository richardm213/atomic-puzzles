import { useCallback, useRef } from "react";

import type { UciSolutionLine } from "../../lib/chess/pgn";
import type { TrainingState } from "./puzzlePlayback";

// Attempt progress survives playback. Interaction locking only guards move input.
export const usePuzzleTraining = () => {
  const interactionLockedRef = useRef(false);
  const attemptRef = useRef<TrainingState>({ candidates: [], progress: 0, solved: false });
  const evaluationTimerRef = useRef<number | null>(null);

  const cancelEvaluation = useCallback(() => {
    if (evaluationTimerRef.current !== null) window.clearTimeout(evaluationTimerRef.current);
    evaluationTimerRef.current = null;
  }, []);

  const resetTraining = useCallback(
    ({
      locked = false,
      solved = false,
      candidates = [],
    }: {
      locked?: boolean;
      solved?: boolean;
      candidates?: UciSolutionLine[];
    } = {}) => {
      interactionLockedRef.current = locked;
      attemptRef.current = { candidates, progress: 0, solved };
      cancelEvaluation();
    },
    [cancelEvaluation],
  );

  return {
    interactionLockedRef,
    attemptRef,
    evaluationTimerRef,
    cancelEvaluation,
    resetTraining,
  };
};
