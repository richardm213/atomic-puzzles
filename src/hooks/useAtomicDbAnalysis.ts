import { startTransition, useEffect, useRef, useState } from "react";

import {
  type AnalysisLines,
  analyzedAtomicDbMoves,
  createAnalysisMoveComposer,
  verifyAtomicDbMates,
} from "../lib/atomicDb/analysisMoves";
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
import type { AtomicDbPosition, AtomicDbResult } from "../utils/atomicDb";
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
    const { databaseResult, linesForMoves, engineResult } = createAnalysisMoveComposer(
      fen,
      lineCount,
      plyCount,
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
        setState((current) =>
          controller.signal.aborted
            ? current
            : {
                result: { fen, position },
                requestedFen: fen,
                requestedOptions: requestOptions,
                status: "ready",
                error: "",
                principalVariations: linesForMoves(position?.moves ?? [], lines),
                source: supplemented ? "mixed" : "atomicdb",
                ...(supplemented ? { engine: assistanceEngine } : {}),
              },
        );
      });
    };

    const publishCachedPosition = (rawPosition: AtomicDbPosition): void => {
      const { position, lines } = databaseResult(rawPosition, cachedLinesFor(rawPosition));
      setState({
        result: { fen, position },
        requestedFen: fen,
        requestedOptions: requestOptions,
        status: "loading",
        error: "",
        principalVariations: linesForMoves(position.moves, lines),
        source: "atomicdb",
      });
    };

    // The search belongs to this position. When AtomicDB supplies partial data,
    // publish the same engine search against that data, including progress already received.
    let databasePending = false;
    let database: { position: AtomicDbPosition; lines: AnalysisLines } | undefined;
    let engine:
      | {
          controller: AbortController;
          candidates: EngineCandidate[] | undefined;
          status: "loading" | "ready" | "error";
          error: string;
        }
      | undefined;

    const publishEngine = () => {
      const search = engine;
      if (!search || search.controller.signal.aborted) return;
      if (search.status === "error" && databasePending) return;
      if (search.status === "error" && database) {
        publishPosition(database.position, database.lines);
        return;
      }

      const result = search.candidates && engineResult(search.candidates, database);
      const position = result?.position ?? database?.position;
      const lines = result?.lines ?? linesForMoves(position?.moves ?? [], database?.lines ?? {});
      const { status, error } = search;
      const source = database ? "mixed" : "engine";
      startTransition(() => {
        setState((current) =>
          search.controller.signal.aborted
            ? current
            : {
                result: position
                  ? { fen, position }
                  : status === "error"
                    ? { fen, position: null }
                    : current.result,
                requestedFen: fen,
                requestedOptions: requestOptions,
                status,
                error,
                principalVariations: lines,
                source,
                engine: assistanceEngine,
              },
        );
      });
    };

    const startEngine = (restartFailed = false) => {
      if (!engine || (restartFailed && engine.status === "error")) {
        engine?.controller.abort();
        const search: NonNullable<typeof engine> = {
          controller: new AbortController(),
          candidates: undefined,
          status: "loading",
          error: "",
        };
        engine = search;
        const publish = (candidates: EngineCandidate[], status: "loading" | "ready") => {
          if (search.controller.signal.aborted) return;
          search.candidates = candidates;
          search.status = status;
          publishEngine();
        };
        void analyzeFairyStockfishPosition(
          fen,
          lineCount,
          search.controller.signal,
          (candidates) => publish(candidates, "loading"),
          assistanceEngine,
          {
            ...(engineThinkTimeMs === undefined ? {} : { thinkTimeMs: engineThinkTimeMs }),
            ...(engineMaxDepth === undefined ? {} : { maxDepth: engineMaxDepth }),
            candidateLimit,
          },
        ).then(
          (candidates) => publish(candidates, "ready"),
          (error: unknown) => {
            if (search.controller.signal.aborted) return;
            search.status = "error";
            search.error = getErrorMessage(error, "Engine analysis failed.");
            publishEngine();
          },
        );
      }
      publishEngine();
    };

    const publishAtomicDbOrFallback = (
      rawPosition: AtomicDbPosition | null,
      lines: AnalysisLines,
    ): void => {
      const analysis = rawPosition && databaseResult(rawPosition, lines);
      if (fallbackToEngine && !analysis?.position.moves.length) {
        startEngine(true);
        return;
      }
      if (
        analysis &&
        fallbackToEngine &&
        analyzedAtomicDbMoves(fen, analysis.position).length < lineCount
      ) {
        database = analysis;
        startEngine();
      } else {
        engine?.controller.abort();
        publishPosition(analysis?.position ?? null, analysis?.lines ?? lines);
      }
      if (!analysis) return;
      // Publish the database result immediately. The position-scoped check only replaces
      // values for which Atomic-Stockfish found a mate.
      void verifyAtomicDbMates(fen, analysis, controller.signal, true)
        .then((verified) => {
          if (controller.signal.aborted || verified === analysis) return;
          if (database) {
            database = verified;
            publishEngine();
          } else {
            publishPosition(verified.position, verified.lines);
          }
        })
        .catch(() => undefined);
    };

    const abort = () => {
      controller.abort();
      engine?.controller.abort();
    };

    if (useAtomicStockfishOnly) {
      startEngine();
      return abort;
    }

    const completeBundle = peekAtomicDbAnalysisBundle(fen, databaseLineCount, plyCount);
    if (completeBundle) {
      publishAtomicDbOrFallback(completeBundle.position, completeBundle.lines);
      return abort;
    }

    let showingCachedPosition = false;
    const cached = peekAtomicDbPosition(fen);
    if (cached.found) {
      if (cached.completePreload) {
        publishAtomicDbOrFallback(cached.value, cachedLinesFor(cached.value));
        return abort;
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
    const requestPosition = async (): Promise<void> => {
      databasePending = true;
      if (fallbackToEngine) graceTimer = window.setTimeout(startEngine, ATOMIC_DB_GRACE_MS);
      try {
        const bundle = await loadAtomicDbAnalysisBundle(
          fen,
          databaseLineCount,
          plyCount,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        databasePending = false;
        publishAtomicDbOrFallback(bundle.position, bundle.lines);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        databasePending = false;
        if (fallbackToEngine) {
          startEngine(true);
          return;
        }
        startTransition(() => {
          setState((current) =>
            controller.signal.aborted
              ? current
              : {
                  ...current,
                  requestedFen: fen,
                  requestedOptions: requestOptions,
                  status: "error",
                  error: getErrorMessage(error, "AtomicDB analysis failed."),
                },
          );
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
      abort();
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
