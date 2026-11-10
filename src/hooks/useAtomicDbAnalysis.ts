import { startTransition, useEffect, useRef, useState } from "react";

import {
  loadAtomicDbAnalysisBundle,
  peekAtomicDbPosition,
  peekAtomicDbVariationLines,
} from "../lib/atomicDb/analysisRepository";
import { isAtomicTablebasePosition } from "../lib/atomicTablebase/material";
import {
  analyzeFairyStockfishPosition,
  type EngineCandidate,
} from "../lib/practice/fairyStockfish";
import type { LocalAnalysisEngine } from "../lib/practice/localAnalysisEngine";
import { atomicLegalMoveCount } from "../lib/puzzles/solutionPgn";
import {
  type AtomicDbPosition,
  type AtomicDbResult,
  getAtomicDbMoveEvaluation,
} from "../utils/atomicDb";
import { getErrorMessage } from "../utils/errors";

type AtomicDbAnalysisStatus = "idle" | "loading" | "ready" | "error";

export type AtomicDbAnalysisState = {
  result: AtomicDbResult | null;
  status: AtomicDbAnalysisStatus;
  error: string;
  principalVariations: Record<string, string[]>;
  source?: "atomicdb" | "engine" | "mixed" | "terminal" | undefined;
  engine?: LocalAnalysisEngine | undefined;
};

type AtomicDbAnalysisOptions = {
  enabled?: boolean;
  atomicDbEnabled?: boolean;
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

const engineMove = (candidate: EngineCandidate): AtomicDbPosition["moves"][number] => ({
  uci: candidate.move,
  origin: "engine",
  outcome: "UNKNOWN",
  closure: null,
  score: candidate.scoreType === "cp" ? candidate.score : null,
  point: null,
  mate: candidate.scoreType === "mate" ? candidate.score : null,
  nodeBackedPlies: null,
  searchDepth: candidate.depth ?? null,
});

const enginePosition = (candidates: EngineCandidate[]): AtomicDbPosition => {
  const best = candidates[0] ?? null;
  return {
    key: null,
    outcome: "UNKNOWN",
    closure: null,
    score: best?.scoreType === "cp" ? best.score : null,
    point: null,
    bestMove: best?.move ?? null,
    moves: candidates.map(engineMove),
  };
};

const analyzedAtomicDbMoves = (fen: string, position: AtomicDbPosition) =>
  position.moves.filter((move) => getAtomicDbMoveEvaluation(move, fen).type !== "unknown");

const fillAtomicDbPosition = (
  fen: string,
  position: AtomicDbPosition,
  candidates: EngineCandidate[],
  lineCount: number,
): AtomicDbPosition => {
  const atomicDbMoves = analyzedAtomicDbMoves(fen, position).slice(0, lineCount);
  const usedMoves = new Set(atomicDbMoves.map((move) => move.uci));
  const engineMoves = candidates
    .filter((candidate) => !usedMoves.has(candidate.move))
    .slice(0, Math.max(0, lineCount - atomicDbMoves.length))
    .map(engineMove);
  return { ...position, moves: [...atomicDbMoves, ...engineMoves] };
};

export const useAtomicDbAnalysis = (
  fen: string,
  {
    enabled = true,
    atomicDbEnabled = true,
    debounceMs = 220,
    lineCount: requestedLineCount = 3,
    plyCount: requestedPlyCount = 5,
    suspended = false,
    fallbackToEngine = false,
  }: AtomicDbAnalysisOptions = {},
): AtomicDbAnalysisState => {
  const [state, setState] = useState<RequestState>(INITIAL_STATE);
  const [engineFocusEpoch, setEngineFocusEpoch] = useState(0);
  const lastRequestAtRef = useRef<number | null>(null);
  const useAtomicStockfishOnly =
    !atomicDbEnabled || (fallbackToEngine && isAtomicTablebasePosition(fen));

  useEffect(() => {
    if (!fallbackToEngine && atomicDbEnabled) return;
    const retryInActiveTab = (): void => setEngineFocusEpoch((epoch) => epoch + 1);
    window.addEventListener("focus", retryInActiveTab);
    return () => window.removeEventListener("focus", retryInActiveTab);
  }, [atomicDbEnabled, fallbackToEngine, useAtomicStockfishOnly]);

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
    const assistanceEngine: LocalAnalysisEngine = "atomic-stockfish";
    const requestedLines = clampInteger(requestedLineCount, 1, MAX_LINE_COUNT);
    const legalMoveCount = atomicLegalMoveCount(fen);
    const lineCount =
      legalMoveCount > 0 ? Math.min(requestedLines, legalMoveCount) : requestedLines;
    const plyCount = clampInteger(requestedPlyCount, 1, MAX_PLY_COUNT);
    const cachedLinesFor = (position: AtomicDbPosition | null): Record<string, string[]> => {
      const rootMoves = position?.moves.slice(0, lineCount).map((move) => move.uci) ?? [];
      const lines = peekAtomicDbVariationLines(fen, rootMoves, plyCount);
      for (const rootMove of rootMoves) lines[rootMove] ??= [rootMove];
      return lines;
    };

    const publishPosition = (
      position: AtomicDbPosition | null,
      lines: Record<string, string[]> = cachedLinesFor(position),
    ): void => {
      const supplemented = position?.moves.some(
        (move) => move.origin === "engine" || move.variationSource === "engine",
      );
      startTransition(() => {
        setState({
          result: { fen, position },
          requestedFen: fen,
          status: "ready",
          error: "",
          principalVariations: lines,
          source: supplemented ? "mixed" : "atomicdb",
          ...(supplemented ? { engine: assistanceEngine } : {}),
        });
      });
    };

    const publishCachedPosition = (position: AtomicDbPosition): void => {
      setState({
        result: { fen, position },
        requestedFen: fen,
        status: "loading",
        error: "",
        principalVariations: cachedLinesFor(position),
        source: "atomicdb",
      });
    };

    const publishEngineFallback = async (): Promise<void> => {
      setState((current) => ({
        ...current,
        requestedFen: fen,
        status: "loading",
        error: "",
        principalVariations: {},
        source: "engine",
        engine: assistanceEngine,
      }));
      try {
        const publishEngineCandidates = (
          candidates: EngineCandidate[],
          status: AtomicDbAnalysisStatus,
        ): void => {
          if (controller.signal.aborted) return;
          startTransition(() => {
            setState({
              result: { fen, position: enginePosition(candidates) },
              requestedFen: fen,
              status,
              error: "",
              principalVariations: Object.fromEntries(
                candidates.map((candidate) => [
                  candidate.move,
                  candidate.principalVariation?.slice(0, plyCount) ?? [candidate.move],
                ]),
              ),
              source: "engine",
              engine: assistanceEngine,
            });
          });
        };
        const publishProgress = (progressCandidates: EngineCandidate[]): void =>
          publishEngineCandidates(progressCandidates, "loading");
        const candidates = await analyzeFairyStockfishPosition(
          fen,
          lineCount,
          controller.signal,
          publishProgress,
          assistanceEngine,
        );
        if (controller.signal.aborted) return;
        publishEngineCandidates(candidates, "ready");
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        startTransition(() => {
          setState({
            result: { fen, position: null },
            requestedFen: fen,
            status: "error",
            error: getErrorMessage(error, "Engine analysis failed."),
            principalVariations: {},
            source: "engine",
            engine: assistanceEngine,
          });
        });
      }
    };

    const publishAtomicDbWithEngineFill = async (
      position: AtomicDbPosition,
      atomicDbLines: Record<string, string[]>,
    ): Promise<void> => {
      setState({
        result: { fen, position },
        requestedFen: fen,
        status: "loading",
        error: "",
        principalVariations: atomicDbLines,
        source: "mixed",
        engine: assistanceEngine,
      });

      const publishMixedCandidates = (
        candidates: EngineCandidate[],
        status: AtomicDbAnalysisStatus,
      ): void => {
        if (controller.signal.aborted) return;
        const filledPosition = fillAtomicDbPosition(fen, position, candidates, lineCount);
        const retainedMoveUcis = new Set(
          analyzedAtomicDbMoves(fen, position).map((move) => move.uci),
        );
        const engineLines = Object.fromEntries(
          candidates
            .filter((candidate) => {
              if (!retainedMoveUcis.has(candidate.move)) return true;
              const atomicDbLineLength = atomicDbLines[candidate.move]?.length ?? 1;
              return (candidate.principalVariation?.length ?? 1) > atomicDbLineLength;
            })
            .map((candidate) => [
              candidate.move,
              candidate.principalVariation?.slice(0, plyCount) ?? [candidate.move],
            ]),
        );
        startTransition(() => {
          setState((current) =>
            current.requestedFen === fen
              ? {
                  ...current,
                  result: { fen, position: filledPosition },
                  status,
                  error: "",
                  principalVariations: { ...current.principalVariations, ...engineLines },
                  source: "mixed",
                  engine: assistanceEngine,
                }
              : current,
          );
        });
      };

      try {
        const candidates = await analyzeFairyStockfishPosition(
          fen,
          lineCount,
          controller.signal,
          (progressCandidates) => publishMixedCandidates(progressCandidates, "loading"),
          assistanceEngine,
        );
        if (!controller.signal.aborted) publishMixedCandidates(candidates, "ready");
      } catch {
        if (controller.signal.aborted) return;
        // AtomicDB remains useful even if the optional local fill cannot finish.
        startTransition(() => {
          setState((current) =>
            current.requestedFen === fen
              ? {
                  ...current,
                  status: "ready",
                  error: "",
                  source: "atomicdb",
                  engine: undefined,
                }
              : current,
          );
        });
      }
    };

    const publishAtomicDbOrFallback = (
      position: AtomicDbPosition | null,
      lines: Record<string, string[]>,
    ): void => {
      if (fallbackToEngine && (!position || position.moves.length === 0)) {
        void publishEngineFallback();
        return;
      }
      const analyzedMoveCount = position
        ? analyzedAtomicDbMoves(fen, position).slice(0, lineCount).length
        : 0;
      if (fallbackToEngine && position && analyzedMoveCount < lineCount) {
        void publishAtomicDbWithEngineFill(position, lines);
        return;
      }
      publishPosition(position, lines);
    };

    if (useAtomicStockfishOnly) {
      void publishEngineFallback();
      return () => controller.abort();
    }

    let showingCachedPosition = false;
    const cached = peekAtomicDbPosition(fen);
    if (cached.found) {
      if (cached.completePreload) {
        publishAtomicDbOrFallback(cached.value, cachedLinesFor(cached.value));
        return () => controller.abort();
      }
      if (cached.value) {
        showingCachedPosition = true;
        publishCachedPosition(cached.value);
      }
    }

    const requestedAt = Date.now();
    const shouldDebounce =
      lastRequestAtRef.current !== null && requestedAt - lastRequestAtRef.current < debounceMs;
    lastRequestAtRef.current = requestedAt;
    if (!showingCachedPosition) {
      setState((current) => ({
        ...current,
        requestedFen: fen,
        status: "loading",
        error: "",
        principalVariations: {},
        source: "atomicdb",
      }));
    }

    const requestPosition = async (): Promise<void> => {
      try {
        const bundle = await loadAtomicDbAnalysisBundle(
          fen,
          lineCount,
          plyCount,
          controller.signal,
        );
        if (!controller.signal.aborted) {
          publishAtomicDbOrFallback(bundle.position, bundle.lines);
        }
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (fallbackToEngine) {
          void publishEngineFallback();
          return;
        }
        startTransition(() => {
          setState((current) => ({
            ...current,
            requestedFen: fen,
            status: "error",
            error: getErrorMessage(error, "AtomicDB analysis failed."),
          }));
        });
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
    atomicDbEnabled,
    fallbackToEngine,
    engineFocusEpoch,
    fen,
    requestedLineCount,
    requestedPlyCount,
    suspended,
    useAtomicStockfishOnly,
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
    source: useAtomicStockfishOnly ? "engine" : "atomicdb",
    ...(useAtomicStockfishOnly ? { engine: "atomic-stockfish" } : {}),
  };
};
