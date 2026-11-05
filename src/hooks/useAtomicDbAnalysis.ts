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
import {
  type LocalAnalysisEngine,
  readLocalAnalysisEngine,
} from "../lib/practice/localAnalysisEngine";
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

const hasSingleForcedMateLoss = (fen: string, position: AtomicDbPosition): boolean => {
  const analyzedMoves = analyzedAtomicDbMoves(fen, position);
  if (analyzedMoves.length !== 1) return false;
  const evaluation = getAtomicDbMoveEvaluation(analyzedMoves[0]!, fen);
  if (evaluation.type !== "mate") return false;
  const blackToMove = fen.trim().split(/\s+/)[1] === "b";
  return blackToMove ? evaluation.value > 0 : evaluation.value < 0;
};

const fillAtomicDbPosition = (
  fen: string,
  position: AtomicDbPosition,
  candidates: EngineCandidate[],
  lineCount: number,
  replaceUnevaluatedMoves: boolean,
): AtomicDbPosition => {
  const atomicDbMoves = (
    replaceUnevaluatedMoves ? analyzedAtomicDbMoves(fen, position) : position.moves
  ).slice(0, lineCount);
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
  const useAtomicStockfishOnly = fallbackToEngine && isAtomicTablebasePosition(fen);

  useEffect(() => {
    if (!fallbackToEngine) return;
    const retryInActiveTab = (): void => {
      if (useAtomicStockfishOnly || readLocalAnalysisEngine() === "atomic-stockfish") {
        setEngineFocusEpoch((epoch) => epoch + 1);
      }
    };
    window.addEventListener("focus", retryInActiveTab);
    return () => window.removeEventListener("focus", retryInActiveTab);
  }, [fallbackToEngine, useAtomicStockfishOnly]);

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
    const localAnalysisEngine = useAtomicStockfishOnly
      ? "atomic-stockfish"
      : readLocalAnalysisEngine();
    const lineCount = clampInteger(requestedLineCount, 1, MAX_LINE_COUNT);
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
      startTransition(() => {
        setState({
          result: { fen, position },
          requestedFen: fen,
          status: "ready",
          error: "",
          principalVariations: lines,
          source: "atomicdb",
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
        engine: localAnalysisEngine,
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
              engine: localAnalysisEngine,
            });
          });
        };
        const publishProgress = (progressCandidates: EngineCandidate[]): void =>
          publishEngineCandidates(progressCandidates, "loading");
        const candidates = useAtomicStockfishOnly
          ? await analyzeFairyStockfishPosition(
              fen,
              lineCount,
              controller.signal,
              publishProgress,
              "atomic-stockfish",
            )
          : await analyzeFairyStockfishPosition(fen, lineCount, controller.signal, publishProgress);
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
            engine: localAnalysisEngine,
          });
        });
      }
    };

    const publishAtomicDbWithEngineFill = async (
      position: AtomicDbPosition,
      atomicDbLines: Record<string, string[]>,
      fillEngine: LocalAnalysisEngine,
      replaceUnevaluatedMoves: boolean,
    ): Promise<void> => {
      setState({
        result: { fen, position },
        requestedFen: fen,
        status: "loading",
        error: "",
        principalVariations: atomicDbLines,
        source: "mixed",
        engine: fillEngine,
      });

      const publishMixedCandidates = (
        candidates: EngineCandidate[],
        status: AtomicDbAnalysisStatus,
      ): void => {
        if (controller.signal.aborted) return;
        const filledPosition = fillAtomicDbPosition(
          fen,
          position,
          candidates,
          lineCount,
          replaceUnevaluatedMoves,
        );
        const retainedMoveUcis = new Set(
          (replaceUnevaluatedMoves ? analyzedAtomicDbMoves(fen, position) : position.moves).map(
            (move) => move.uci,
          ),
        );
        const engineLines = Object.fromEntries(
          candidates
            .filter((candidate) => {
              if (!retainedMoveUcis.has(candidate.move)) return true;
              if (!replaceUnevaluatedMoves) return false;
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
                  engine: fillEngine,
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
          fillEngine,
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
      const forcedMateAssist = position ? hasSingleForcedMateLoss(fen, position) : false;
      if (fallbackToEngine && position && (position.moves.length < lineCount || forcedMateAssist)) {
        void publishAtomicDbWithEngineFill(
          position,
          lines,
          forcedMateAssist ? "atomic-stockfish" : localAnalysisEngine,
          forcedMateAssist,
        );
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
        publishPosition(cached.value);
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
