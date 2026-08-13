import { useCallback, useEffect, useRef, useState } from "react";

import { copyTextToClipboard } from "../utils/clipboard";

export const useCopyFeedback = (resetDelayMs = 1_800) => {
  const [copyLabel, setCopyLabel] = useState("Copy PGN");
  const resetTimerRef = useRef<number | null>(null);

  const clearResetTimer = useCallback((): void => {
    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = null;
  }, []);

  const resetCopyFeedback = useCallback((): void => {
    clearResetTimer();
    setCopyLabel("Copy PGN");
  }, [clearResetTimer]);

  const copy = useCallback(
    async (value: string): Promise<void> => {
      const copied = await copyTextToClipboard(value);
      setCopyLabel(copied ? "Copied" : "Copy failed");
      clearResetTimer();
      resetTimerRef.current = window.setTimeout(() => {
        resetTimerRef.current = null;
        setCopyLabel("Copy PGN");
      }, resetDelayMs);
    },
    [clearResetTimer, resetDelayMs],
  );

  useEffect(() => clearResetTimer, [clearResetTimer]);

  return { copy, copyLabel, resetCopyFeedback };
};
