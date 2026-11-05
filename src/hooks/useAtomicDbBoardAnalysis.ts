import { useCallback, useMemo, useRef } from "react";

import type { SolutionNavigation } from "../types/chessboard";
import type { AtomicDbAnalysisState } from "./useAtomicDbAnalysis";
import { useAtomicDbAnalysis } from "./useAtomicDbAnalysis";

const PRINCIPAL_VARIATION_PLIES = 5;

export const useAtomicDbBoardAnalysis = ({
  currentFen,
  enabled,
  navigation,
  lineCount,
  showFollowUpMoves = true,
  terminalOutcome = null,
  suspended = false,
}: {
  currentFen: string;
  enabled: boolean;
  navigation: SolutionNavigation | null;
  lineCount: number;
  showFollowUpMoves?: boolean;
  terminalOutcome?: "white" | "black" | "draw" | null;
  suspended?: boolean;
}) => {
  const variationStartFenRef = useRef<string | null>(null);
  const variationPlaying = navigation?.type === "line";
  const navigationPending = navigation !== null;
  const fen = variationPlaying ? (variationStartFenRef.current ?? currentFen) : currentFen;
  const analysis = useAtomicDbAnalysis(fen, {
    // Keep loading the root position for the external AtomicDB link, but do not spend requests on
    // invisible continuations while the engine panel is disabled. Any board navigation preempts
    // the current request so the move is applied before analysis resumes on its destination.
    lineCount: enabled ? lineCount : 0,
    plyCount: showFollowUpMoves ? PRINCIPAL_VARIATION_PLIES : 1,
    refreshPreloaded: showFollowUpMoves,
    suspended: navigationPending || suspended,
    fallbackToEngine: enabled,
    enabled: terminalOutcome === null,
  });
  const terminalAnalysis = useMemo<AtomicDbAnalysisState | null>(() => {
    if (!terminalOutcome) return null;
    const outcome =
      terminalOutcome === "white"
        ? "WHITE_WIN"
        : terminalOutcome === "black"
          ? "BLACK_WIN"
          : "DRAW";
    return {
      result: {
        fen: currentFen,
        position: {
          key: null,
          outcome,
          closure: null,
          score: null,
          point: null,
          bestMove: null,
          moves: [],
        },
      },
      status: "ready",
      error: "",
      principalVariations: {},
      source: "terminal",
    } satisfies AtomicDbAnalysisState;
  }, [currentFen, terminalOutcome]);

  const beginVariationPlayback = useCallback((): void => {
    variationStartFenRef.current = currentFen;
  }, [currentFen]);
  const finishVariationPlayback = useCallback((): void => {
    variationStartFenRef.current = null;
  }, []);

  return {
    analysis: terminalAnalysis ?? analysis,
    beginVariationPlayback,
    fen: terminalAnalysis ? currentFen : fen,
    finishVariationPlayback,
    variationPlaying,
  };
};
