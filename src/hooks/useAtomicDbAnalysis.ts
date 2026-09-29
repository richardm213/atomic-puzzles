import { useEffect, useRef, useState } from "react";

import {
  loadAtomicDbPosition,
  loadAtomicDbVariations,
  peekAtomicDbPosition,
} from "../lib/atomicDb/analysisRepository";
import type { AtomicDbPosition, AtomicDbResult } from "../utils/atomicDb";

export type AtomicDbAnalysisStatus = "idle" | "loading" | "ready" | "error";

export type AtomicDbAnalysisState = {
  result: AtomicDbResult | null;
  status: AtomicDbAnalysisStatus;
  error: string;
  principalVariations: Record<string, string[]>;
};

export type AtomicDbAnalysisOptions = {
  enabled?: boolean;
  debounceMs?: number;
  lineCount?: number;
  plyCount?: number;
  suspended?: boolean;
};

type RequestState = AtomicDbAnalysisState & { requestedFen: string | null };

const MAX_LINE_COUNT = 5;
const MAX_PLY_COUNT = 5;
const EMPTY_ANALYSIS: AtomicDbAnalysisState = {
  result: null,
  status: "idle",
  error: "",
  principalVariations: {},
};
const INITIAL_STATE: RequestState = { ...EMPTY_ANALYSIS, requestedFen: null };

const clampInteger = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.floor(value)));

export const useAtomicDbAnalysis = (
  fen: string,
  {
    enabled = true,
    debounceMs = 220,
    lineCount: requestedLineCount = 3,
    plyCount: requestedPlyCount = 5,
    suspended = false,
  }: AtomicDbAnalysisOptions = {},
): AtomicDbAnalysisState => {
  const [state, setState] = useState<RequestState>(INITIAL_STATE);
  const lastRequestAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastRequestAtRef.current = null;
      setState(INITIAL_STATE);
      return;
    }
    // Playback owns the board until it reaches its destination. Keeping this effect dormant both
    // preserves the source analysis and aborts unfinished work from the source position.
    if (suspended) return;

    const controller = new AbortController();
    const lineCount = clampInteger(requestedLineCount, 0, MAX_LINE_COUNT);
    const plyCount = clampInteger(requestedPlyCount, 1, MAX_PLY_COUNT);

    const publishLines = (lines: Record<string, string[]>): void => {
      setState((current) =>
        current.requestedFen === fen
          ? {
              ...current,
              principalVariations: { ...current.principalVariations, ...lines },
            }
          : current,
      );
    };

    const loadLines = (position: AtomicDbPosition | null): void => {
      const rootMoves = position?.moves.slice(0, lineCount).map((move) => move.uci) ?? [];
      if (rootMoves.length === 0) return;

      publishLines(Object.fromEntries(rootMoves.map((move) => [move, [move]])));
      if (plyCount === 1) return;

      void loadAtomicDbVariations(fen, rootMoves, plyCount, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) publishLines(result.lines);
        })
        .catch(() => {
          // A root move remains playable when its optional continuation is unavailable.
        });
    };

    const publishPosition = (position: AtomicDbPosition | null): void => {
      setState({
        result: { fen, position },
        requestedFen: fen,
        status: "ready",
        error: "",
        principalVariations: {},
      });
      loadLines(position);
    };

    const cached = peekAtomicDbPosition(fen);
    if (cached.found) {
      publishPosition(cached.value);
      return () => controller.abort();
    }

    const requestedAt = Date.now();
    const shouldDebounce =
      lastRequestAtRef.current !== null && requestedAt - lastRequestAtRef.current < debounceMs;
    lastRequestAtRef.current = requestedAt;
    setState((current) => ({
      ...current,
      requestedFen: fen,
      status: "loading",
      error: "",
      principalVariations: {},
    }));

    const requestPosition = async (): Promise<void> => {
      try {
        const position = await loadAtomicDbPosition(fen, controller.signal);
        if (!controller.signal.aborted) publishPosition(position);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          requestedFen: fen,
          status: "error",
          error: error instanceof Error ? error.message : "AtomicDB analysis failed.",
        }));
      }
    };

    const timeout = shouldDebounce
      ? window.setTimeout(() => void requestPosition(), debounceMs)
      : null;
    if (!shouldDebounce) void requestPosition();

    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      controller.abort();
    };
  }, [debounceMs, enabled, fen, requestedLineCount, requestedPlyCount, suspended]);

  if (!enabled) return EMPTY_ANALYSIS;
  if (state.requestedFen === fen) return state;

  // Effects run after render. Immediately expose the transition without discarding the last
  // settled result, which prevents the evaluation bar and move list from flashing empty.
  return {
    result: state.result,
    status: state.result?.fen === fen ? "ready" : "loading",
    error: "",
    principalVariations: state.principalVariations,
  };
};
