import { startTransition, useEffect, useRef, useState } from "react";

import { canonicalAtomicMoveUci, createAtomicPosition } from "../../shared/domain/chess/pgn";
import {
  loadAtomicDbAnalysisBundle,
  MAX_ATOMIC_DB_LINES,
  MAX_ATOMIC_DB_PLIES,
  peekAtomicDbAnalysisBundle,
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
  engineThinkTimeMs?: number;
  engineMaxDepth?: number;
  candidateLimit?: number;
};

type RequestState = AtomicDbAnalysisState & {
  requestedFen: string | null;
  requestedOptions: string | null;
};

const NAVIGATION_SETTLE_MS = 160;
const ATOMIC_DB_GRACE_MS = 2_000;
const EMPTY_ANALYSIS: AtomicDbAnalysisState = {
  result: null,
  status: "idle",
  error: "",
  principalVariations: {},
  source: "atomicdb",
};
const INITIAL_STATE: RequestState = {
  ...EMPTY_ANALYSIS,
  requestedFen: null,
  requestedOptions: null,
};

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

const rootMoveKeyFor = (fen: string): ((uci: string) => string) => {
  try {
    const position = createAtomicPosition(fen);
    return (uci) => canonicalAtomicMoveUci(position, uci) ?? uci;
  } catch {
    return (uci) => uci;
  }
};

export const useAtomicDbAnalysis = (
  fen: string,
  {
    enabled = true,
    atomicDbEnabled = true,
    debounceMs = NAVIGATION_SETTLE_MS,
    lineCount: requestedLineCount = 3,
    plyCount: requestedPlyCount = 5,
    suspended = false,
    fallbackToEngine = false,
    engineThinkTimeMs,
    engineMaxDepth,
    candidateLimit = MAX_ATOMIC_DB_LINES,
  }: AtomicDbAnalysisOptions = {},
): AtomicDbAnalysisState => {
  const requestOptions = JSON.stringify([
    atomicDbEnabled,
    fallbackToEngine,
    requestedLineCount,
    requestedPlyCount,
    engineThinkTimeMs,
    engineMaxDepth,
    candidateLimit,
  ]);
  const [state, setState] = useState<RequestState>(INITIAL_STATE);
  const [engineFocusEpoch, setEngineFocusEpoch] = useState(0);
  const lastFenRef = useRef<string | null>(null);
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
      lastFenRef.current = null;
      setState(INITIAL_STATE);
      return;
    }
    // Playback owns the board until it reaches its destination. Keeping this effect dormant both
    // preserves the source analysis and aborts unfinished work from the source position.
    if (suspended) return;

    const positionChanged = lastFenRef.current !== null && lastFenRef.current !== fen;
    lastFenRef.current = fen;
    const controller = new AbortController();
    const assistanceEngine: LocalAnalysisEngine = "atomic-stockfish";
    const requestedLines = clampInteger(requestedLineCount, 1, candidateLimit);
    const legalMoveCount = atomicLegalMoveCount(fen);
    const lineCount =
      legalMoveCount > 0 ? Math.min(requestedLines, legalMoveCount) : requestedLines;
    const plyCount = clampInteger(requestedPlyCount, 1, MAX_ATOMIC_DB_PLIES);
    const databaseLineCount = Math.min(lineCount, MAX_ATOMIC_DB_LINES);
    const rootMoveKey = rootMoveKeyFor(fen);
    const withMoves = (
      position: AtomicDbPosition,
      moves: AtomicDbPosition["moves"],
    ): AtomicDbPosition => {
      const bestKey = position.bestMove ? rootMoveKey(position.bestMove) : null;
      const bestMove = bestKey && moves.find((move) => rootMoveKey(move.uci) === bestKey)?.uci;
      return { ...position, moves, bestMove: bestMove || position.bestMove };
    };
    const distinctPosition = (position: AtomicDbPosition): AtomicDbPosition => {
      const moves = new Map<string, AtomicDbPosition["moves"][number]>();
      for (const move of position.moves) {
        const key = rootMoveKey(move.uci);
        const previous = moves.get(key);
        if (
          !previous ||
          (getAtomicDbMoveEvaluation(previous, fen).type === "unknown" &&
            getAtomicDbMoveEvaluation(move, fen).type !== "unknown")
        ) {
          moves.set(key, move);
        }
      }
      return withMoves(position, [...moves.values()]);
    };
    const linesForMoves = (
      moves: AtomicDbPosition["moves"],
      ...sources: Record<string, string[]>[]
    ): Record<string, string[]> => {
      const byMove = new Map<string, string[]>();
      for (const source of sources) {
        for (const [uci, line] of Object.entries(source)) {
          const key = rootMoveKey(uci);
          const previous = byMove.get(key);
          if (!previous || Math.min(line.length, plyCount) > previous.length) {
            byMove.set(key, line.slice(0, plyCount));
          }
        }
      }
      return Object.fromEntries(
        moves
          .slice(0, lineCount)
          .map(({ uci }) => [uci, [uci, ...(byMove.get(rootMoveKey(uci))?.slice(1) ?? [])]]),
      );
    };
    const engineCandidatesByMove = (
      candidates: EngineCandidate[],
    ): Map<string, EngineCandidate> => {
      const moves = new Map<string, EngineCandidate>();
      for (const candidate of candidates) {
        const key = rootMoveKey(candidate.move);
        if (!moves.has(key)) moves.set(key, candidate);
      }
      return moves;
    };
    const engineLinesFor = (candidates: EngineCandidate[]): Record<string, string[]> =>
      Object.fromEntries(
        candidates.map((candidate) => [
          candidate.move,
          candidate.principalVariation ?? [candidate.move],
        ]),
      );
    const cachedLinesFor = (position: AtomicDbPosition | null): Record<string, string[]> => {
      const rootMoves = position?.moves.map((move) => move.uci) ?? [];
      return peekAtomicDbVariationLines(fen, rootMoves, plyCount);
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
          requestedOptions: requestOptions,
          status: "ready",
          error: "",
          principalVariations: linesForMoves(position?.moves ?? [], lines),
          source: supplemented ? "mixed" : "atomicdb",
          ...(supplemented ? { engine: assistanceEngine } : {}),
        });
      });
    };

    const publishCachedPosition = (rawPosition: AtomicDbPosition): void => {
      const position = distinctPosition(rawPosition);
      setState({
        result: { fen, position },
        requestedFen: fen,
        requestedOptions: requestOptions,
        status: "loading",
        error: "",
        principalVariations: linesForMoves(position.moves, cachedLinesFor(rawPosition)),
        source: "atomicdb",
      });
    };

    let databasePending = true;
    let provisionalEngineFailed = false;
    const publishEngineFallback = async (
      signal = controller.signal,
      provisional = false,
    ): Promise<void> => {
      setState((current) => ({
        ...current,
        requestedFen: fen,
        requestedOptions: requestOptions,
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
          if (signal.aborted) return;
          const distinctCandidates = [...engineCandidatesByMove(candidates).values()].slice(
            0,
            lineCount,
          );
          const position = enginePosition(distinctCandidates);
          startTransition(() => {
            setState((current) =>
              signal.aborted
                ? current
                : {
                    result: { fen, position },
                    requestedFen: fen,
                    requestedOptions: requestOptions,
                    status,
                    error: "",
                    principalVariations: linesForMoves(position.moves, engineLinesFor(candidates)),
                    source: "engine",
                    engine: assistanceEngine,
                  },
            );
          });
        };
        const publishProgress = (progressCandidates: EngineCandidate[]): void =>
          publishEngineCandidates(progressCandidates, "loading");
        const candidates = await analyzeFairyStockfishPosition(
          fen,
          lineCount,
          signal,
          publishProgress,
          assistanceEngine,
          {
            ...(engineThinkTimeMs !== undefined ? { thinkTimeMs: engineThinkTimeMs } : {}),
            ...(engineMaxDepth !== undefined ? { maxDepth: engineMaxDepth } : {}),
            candidateLimit,
          },
        );
        if (signal.aborted) return;
        publishEngineCandidates(candidates, "ready");
      } catch (error: unknown) {
        if (signal.aborted) return;
        if (provisional && databasePending) {
          provisionalEngineFailed = true;
          return;
        }
        startTransition(() => {
          setState({
            result: { fen, position: null },
            requestedFen: fen,
            requestedOptions: requestOptions,
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
        requestedOptions: requestOptions,
        status: "loading",
        error: "",
        principalVariations: linesForMoves(position.moves, atomicDbLines),
        source: "mixed",
        engine: assistanceEngine,
      });

      const publishMixedCandidates = (
        candidates: EngineCandidate[],
        status: AtomicDbAnalysisStatus,
      ): void => {
        if (controller.signal.aborted) return;
        const moves = engineCandidatesByMove(candidates);
        const retained = analyzedAtomicDbMoves(fen, position);
        for (const move of retained) moves.delete(rootMoveKey(move.uci));
        const filledMoves = [...retained, ...Array.from(moves.values(), engineMove)].slice(
          0,
          lineCount,
        );
        const filledPosition = withMoves(position, filledMoves);
        startTransition(() => {
          setState((current) =>
            !controller.signal.aborted && current.requestedFen === fen
              ? {
                  ...current,
                  result: { fen, position: filledPosition },
                  status,
                  error: "",
                  principalVariations: linesForMoves(
                    filledMoves,
                    atomicDbLines,
                    engineLinesFor(candidates),
                  ),
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
          {
            ...(engineThinkTimeMs !== undefined ? { thinkTimeMs: engineThinkTimeMs } : {}),
            ...(engineMaxDepth !== undefined ? { maxDepth: engineMaxDepth } : {}),
            candidateLimit,
          },
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
      rawPosition: AtomicDbPosition | null,
      lines: Record<string, string[]>,
    ): void => {
      const position = rawPosition && distinctPosition(rawPosition);
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

    const completeBundle = peekAtomicDbAnalysisBundle(fen, databaseLineCount, plyCount);
    if (completeBundle) {
      publishAtomicDbOrFallback(completeBundle.position, completeBundle.lines);
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

    if (!showingCachedPosition) {
      setState((current) => ({
        ...current,
        requestedFen: fen,
        requestedOptions: requestOptions,
        status: "loading",
        error: "",
        principalVariations: {},
        source: "atomicdb",
      }));
    }

    let graceTimer: number | undefined;
    let provisionalEngine: AbortController | undefined;
    const requestPosition = async (): Promise<void> => {
      if (fallbackToEngine) {
        graceTimer = window.setTimeout(() => {
          provisionalEngine = new AbortController();
          void publishEngineFallback(provisionalEngine.signal, true);
        }, ATOMIC_DB_GRACE_MS);
      }
      try {
        const bundle = await loadAtomicDbAnalysisBundle(
          fen,
          databaseLineCount,
          plyCount,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        databasePending = false;
        if (provisionalEngine && !provisionalEngineFailed && !bundle.position?.moves.length) return;
        provisionalEngine?.abort();
        publishAtomicDbOrFallback(bundle.position, bundle.lines);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        databasePending = false;
        if (fallbackToEngine) {
          if (!provisionalEngine || provisionalEngineFailed) void publishEngineFallback();
          return;
        }
        startTransition(() => {
          setState((current) => ({
            ...current,
            requestedFen: fen,
            requestedOptions: requestOptions,
            status: "error",
            error: getErrorMessage(error, "AtomicDB analysis failed."),
          }));
        });
      } finally {
        window.clearTimeout(graceTimer);
      }
    };

    const shouldDebounce = positionChanged && debounceMs > 0;
    const timeout = shouldDebounce
      ? window.setTimeout(() => void requestPosition(), debounceMs)
      : null;
    if (!shouldDebounce) void requestPosition();

    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      window.clearTimeout(graceTimer);
      provisionalEngine?.abort();
      controller.abort();
    };
  }, [
    debounceMs,
    requestOptions,
    engineThinkTimeMs,
    engineMaxDepth,
    candidateLimit,
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
  if (state.requestedFen === fen && state.requestedOptions === requestOptions) return state;

  // Effects run after render. Immediately expose the transition without discarding the last
  // settled result, which prevents the evaluation bar and move list from flashing empty.
  return {
    result: state.result,
    status: "loading",
    error: "",
    principalVariations: state.principalVariations,
    source: useAtomicStockfishOnly ? "engine" : "atomicdb",
    ...(useAtomicStockfishOnly ? { engine: "atomic-stockfish" } : {}),
  };
};
