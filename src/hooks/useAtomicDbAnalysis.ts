import { useEffect, useRef, useState } from "react";

import {
  loadAtomicDbPosition,
  loadAtomicDbVariations,
  peekAtomicDbPosition,
} from "../lib/atomicDb/analysisRepository";
import {
  analyzeFairyStockfishPosition,
  type EngineCandidate,
} from "../lib/practice/fairyStockfish";
import type { AtomicDbPosition, AtomicDbResult } from "../utils/atomicDb";
import { getErrorMessage } from "../utils/errors";

export type AtomicDbAnalysisStatus = "idle" | "loading" | "ready" | "error";

export type AtomicDbAnalysisState = {
  result: AtomicDbResult | null;
  status: AtomicDbAnalysisStatus;
  error: string;
  principalVariations: Record<string, string[]>;
  source?: "atomicdb" | "engine" | undefined;
};

export type AtomicDbAnalysisOptions = {
  enabled?: boolean;
  debounceMs?: number;
  lineCount?: number;
  plyCount?: number;
  suspended?: boolean;
  fallbackToEngine?: boolean;
};

type RequestState = AtomicDbAnalysisState & { requestedFen: string | null };

const MAX_LINE_COUNT = 5;
const MAX_PLY_COUNT = 5;
const EMPTY_ANALYSIS: AtomicDbAnalysisState = {
  result: null,
  status: "idle",
  error: "",
  principalVariations: {},
  source: "atomicdb",
};
const INITIAL_STATE: RequestState = { ...EMPTY_ANALYSIS, requestedFen: null };

const clampInteger = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.floor(value)));

const enginePosition = (candidates: EngineCandidate[]): AtomicDbPosition => {
  const best = candidates[0] ?? null;
  return {
    key: null,
    outcome: "UNKNOWN",
    closure: null,
    score: best?.scoreType === "cp" ? best.score : null,
    point: null,
    bestMove: best?.move ?? null,
    moves: candidates.map((candidate) => ({
      uci: candidate.move,
      outcome: "UNKNOWN",
      closure: null,
      score: candidate.scoreType === "cp" ? candidate.score : null,
      point: null,
      mate: candidate.scoreType === "mate" ? candidate.score : null,
      backedPlies: candidate.depth ?? 0,
    })),
  };
};

export const useAtomicDbAnalysis = (
  fen: string,
  {
    enabled = true,
    debounceMs = 220,
    lineCount: requestedLineCount = 3,
    plyCount: requestedPlyCount = 5,
    suspended = false,
    fallbackToEngine = false,
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
        source: "atomicdb",
      });
      loadLines(position);
    };

    const publishEngineFallback = async (): Promise<void> => {
      setState({
        result: { fen, position: null },
        requestedFen: fen,
        status: "loading",
        error: "",
        principalVariations: {},
        source: "engine",
      });
      try {
        const candidates = await analyzeFairyStockfishPosition(fen, lineCount, controller.signal);
        if (controller.signal.aborted) return;
        setState({
          result: { fen, position: enginePosition(candidates) },
          requestedFen: fen,
          status: "ready",
          error: "",
          principalVariations: Object.fromEntries(
            candidates.map((candidate) => [
              candidate.move,
              candidate.principalVariation?.slice(0, plyCount) ?? [candidate.move],
            ]),
          ),
          source: "engine",
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        setState({
          result: { fen, position: null },
          requestedFen: fen,
          status: "error",
          error: getErrorMessage(error, "Engine analysis failed."),
          principalVariations: {},
          source: "engine",
        });
      }
    };

    const publishAtomicDbOrFallback = (position: AtomicDbPosition | null): void => {
      if (fallbackToEngine && lineCount > 0 && (!position || position.moves.length === 0)) {
        void publishEngineFallback();
        return;
      }
      publishPosition(position);
    };

    const cached = peekAtomicDbPosition(fen);
    if (cached.found) {
      publishAtomicDbOrFallback(cached.value);
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
      source: "atomicdb",
    }));

    const requestPosition = async (): Promise<void> => {
      try {
        const position = await loadAtomicDbPosition(fen, controller.signal);
        if (!controller.signal.aborted) publishAtomicDbOrFallback(position);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        setState((current) => ({
          ...current,
          requestedFen: fen,
          status: "error",
          error: getErrorMessage(error, "AtomicDB analysis failed."),
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
  }, [
    debounceMs,
    enabled,
    fallbackToEngine,
    fen,
    requestedLineCount,
    requestedPlyCount,
    suspended,
  ]);

  if (!enabled) return EMPTY_ANALYSIS;
  if (state.requestedFen === fen) return state;

  // Effects run after render. Immediately expose the transition without discarding the last
  // settled result, which prevents the evaluation bar and move list from flashing empty.
  return {
    result: state.result,
    status: state.result?.fen === fen ? "ready" : "loading",
    error: "",
    principalVariations: state.principalVariations,
    source: state.source,
  };
};
