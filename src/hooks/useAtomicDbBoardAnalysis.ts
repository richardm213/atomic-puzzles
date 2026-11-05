import { useCallback, useMemo, useRef } from "react";

import type { SolutionNavigation } from "../types/chessboard";
import type { AtomicDbAnalysisState } from "./useAtomicDbAnalysis";
import { useAtomicDbAnalysis } from "./useAtomicDbAnalysis";

const PRINCIPAL_VARIATION_PLIES = 5;

export const useAtomicDbBoardAnalysis = ({
  currentFen,
  enabled,
  atomicDbEnabled = true,
  navigation,
  lineCount,
  showFollowUpMoves = true,
  terminalOutcome = null,
  suspended = false,
}: {
  currentFen: string;
  enabled: boolean;
  atomicDbEnabled?: boolean;
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
    // A disabled panel is fully dormant. Any board navigation preempts the current request so the
    // move is applied before analysis resumes on its destination.
    lineCount,
    atomicDbEnabled,
    plyCount: showFollowUpMoves ? PRINCIPAL_VARIATION_PLIES : 1,
    suspended: navigationPending || suspended,
    fallbackToEngine: enabled,
    enabled: enabled && terminalOutcome === null,
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
