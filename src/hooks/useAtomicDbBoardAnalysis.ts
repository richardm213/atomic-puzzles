import { useCallback, useRef } from "react";

import type { SolutionNavigation } from "../types/chessboard";
import { useAtomicDbAnalysis } from "./useAtomicDbAnalysis";

const PRINCIPAL_VARIATION_PLIES = 5;

export const useAtomicDbBoardAnalysis = ({
  currentFen,
  enabled,
  navigation,
  lineCount,
}: {
  currentFen: string;
  enabled: boolean;
  navigation: SolutionNavigation | null;
  lineCount: number;
}) => {
  const variationStartFenRef = useRef<string | null>(null);
  const variationPlaying = navigation?.type === "line";
  const fen = variationPlaying ? (variationStartFenRef.current ?? currentFen) : currentFen;
  const analysis = useAtomicDbAnalysis(fen, {
    // Keep loading the root position for the external AtomicDB link, but do not spend requests on
    // invisible continuations while the engine panel is disabled.
    lineCount: enabled ? lineCount : 0,
    plyCount: PRINCIPAL_VARIATION_PLIES,
    suspended: variationPlaying,
  });

  const beginVariationPlayback = useCallback((): void => {
    variationStartFenRef.current = currentFen;
  }, [currentFen]);
  const finishVariationPlayback = useCallback((): void => {
    variationStartFenRef.current = null;
  }, []);

  return {
    analysis,
    beginVariationPlayback,
    fen,
    finishVariationPlayback,
    variationPlaying,
  };
};
