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
  type PreloadedAtomicDbGamePosition,
} from "../lib/atomicDb/analysisRepository";
import { isAtomicTablebasePosition } from "../lib/atomicTablebase/material";
import {
  analyzeFairyStockfishPosition,
  type EngineCandidate,
  warmLocalAnalysisEngine,
} from "../lib/practice/fairyStockfish";
import {
  DEFAULT_LOCAL_ANALYSIS_ENGINE,
  type LocalAnalysisEngine,
} from "../lib/practice/localAnalysisEngine";
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
  atomicDbFollowUps?: boolean;
  progressivePreview?: boolean;
  storedPosition?: PreloadedAtomicDbGamePosition | undefined;
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
const ATOMIC_DB_PREVIEW_DELAY_MS = 180;
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
    atomicDbFollowUps = true,
    progressivePreview = false,
    storedPosition,
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
    atomicDbFollowUps,
    fallbackToEngine,
    requestedLineCount,
    requestedPlyCount,
    engineThinkTimeMs,
    engineMaxDepth,
    candidateLimit,
    storedPosition?.position?.key,
    storedPosition?.complete,
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
    const request = { requestedFen: fen, requestedOptions: requestOptions };
    const publish = (
      next: (current: RequestState) => AtomicDbAnalysisState,
      signal = controller.signal,
    ): void => {
      startTransition(() => {
        setState((current) => (signal.aborted ? current : { ...next(current), ...request }));
      });
    };
    const requestedLines = clampInteger(requestedLineCount, 1, candidateLimit);
    const legalMoveCount = atomicLegalMoveCount(fen);
    const lineCount =
      legalMoveCount > 0 ? Math.min(requestedLines, legalMoveCount) : requestedLines;
    const plyCount = clampInteger(requestedPlyCount, 1, MAX_ATOMIC_DB_PLIES);
    const databaseLineCount = Math.min(lineCount, MAX_ATOMIC_DB_LINES);
    const databasePlyCount = atomicDbFollowUps ? plyCount : 1;
    const { databaseResult, linesForMoves, engineResult, withEngineFollowUps } =
      createAnalysisMoveComposer(fen, lineCount, plyCount);
    const needsEngine = (position: AtomicDbPosition | null) =>
      fallbackToEngine && (!position || analyzedAtomicDbMoves(fen, position).length < lineCount);
    const previewLinesFor = (position: AtomicDbPosition) =>
      storedPosition?.principalVariations ??
      peekAtomicDbVariationLines(
        fen,
        position.moves.map((move) => move.uci),
        databasePlyCount,
      );

    const publishPosition = (position: AtomicDbPosition | null, lines: AnalysisLines): void => {
      const supplemented = position?.moves.some(
        (move) => move.origin === "engine" || move.variationSource === "engine",
      );
      publish(() => ({
        result: { fen, position },
        status: "ready",
        error: "",
        principalVariations: linesForMoves(position?.moves ?? [], lines),
        source: supplemented ? "mixed" : "atomicdb",
        ...(supplemented ? { engine: DEFAULT_LOCAL_ANALYSIS_ENGINE } : {}),
      }));
    };

    const prepareDatabasePosition = (rawPosition: AtomicDbPosition, lines: AnalysisLines) => {
      const normalized = databaseResult(rawPosition, lines);
      return atomicDbFollowUps ? normalized : { ...normalized, lines: {} };
    };

    const publishPreview = (rawPosition: AtomicDbPosition): void => {
      const { position, lines } = prepareDatabasePosition(
        rawPosition,
        previewLinesFor(rawPosition),
      );
      setState({
        ...request,
        result: { fen, position },
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
      publish(
        (current) => ({
          result:
            position || status === "error" ? { fen, position: position ?? null } : current.result,
          status,
          error,
          principalVariations: lines,
          source,
          engine: DEFAULT_LOCAL_ANALYSIS_ENGINE,
        }),
        search.controller.signal,
      );
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
          DEFAULT_LOCAL_ANALYSIS_ENGINE,
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
      const analysis = rawPosition && prepareDatabasePosition(rawPosition, lines);
      if (needsEngine(analysis?.position ?? null)) {
        if (analysis?.position.moves.length) {
          database = analysis;
          startEngine();
        } else {
          startEngine(true);
          return;
        }
      } else {
        engine?.controller.abort();
        publishPosition(analysis?.position ?? null, analysis?.lines ?? lines);
      }
      if (!analysis) return;
      const publishSupplement = (next: typeof analysis, previous: typeof analysis): void => {
        if (controller.signal.aborted || next === previous) return;
        if (database) {
          database = next;
          publishEngine();
        } else {
          publishPosition(next.position, next.lines);
        }
      };
      // Publish the root moves first so a local search never holds up their evaluations.
      void (async () => {
        const extended = atomicDbFollowUps
          ? analysis
          : await withEngineFollowUps(analysis, controller.signal, (progress) =>
              publishSupplement(progress, analysis),
            ).catch(() => analysis);
        publishSupplement(extended, analysis);
        const verified = await verifyAtomicDbMates(fen, extended, controller.signal, true);
        publishSupplement(verified, extended);
      })().catch(() => undefined);
    };

    const abort = () => {
      controller.abort();
      engine?.controller.abort();
    };

    if (useAtomicStockfishOnly) {
      startEngine();
      return abort;
    }

    if (!atomicDbFollowUps && fallbackToEngine) {
      warmLocalAnalysisEngine(DEFAULT_LOCAL_ANALYSIS_ENGINE);
    }

    if (storedPosition?.complete) {
      publishAtomicDbOrFallback(storedPosition.position, storedPosition.principalVariations);
      return abort;
    }

    const completeBundle = peekAtomicDbAnalysisBundle(fen, databaseLineCount, databasePlyCount);
    if (completeBundle) {
      publishAtomicDbOrFallback(completeBundle.position, completeBundle.lines);
      return abort;
    }

    let preview = storedPosition?.position ?? peekAtomicDbPosition(fen);

    if (preview) {
      publishPreview(preview);
    } else {
      setState((current) => ({
        ...current,
        ...request,
        status: "loading",
        error: "",
        principalVariations: {},
        source: "atomicdb",
      }));
    }

    let graceTimer: number | undefined;
    let previewTimer: number | undefined;
    const previewController = new AbortController();
    const finishDatabaseRequest = () => {
      window.clearTimeout(graceTimer);
      window.clearTimeout(previewTimer);
      previewController.abort();
    };
    const requestPosition = async (): Promise<void> => {
      databasePending = true;
      if (fallbackToEngine) {
        graceTimer = window.setTimeout(() => {
          if (needsEngine(preview)) startEngine();
        }, ATOMIC_DB_GRACE_MS);
      }
      if (progressivePreview && databasePlyCount > 1 && !preview) {
        previewTimer = window.setTimeout(() => {
          void loadAtomicDbAnalysisBundle(fen, databaseLineCount, 1, previewController.signal)
            .then(({ position }) => {
              if (!position?.moves.length || previewController.signal.aborted) return;
              preview = position;
              if (!engine) publishPreview(position);
            })
            .catch(() => undefined);
        }, ATOMIC_DB_PREVIEW_DELAY_MS);
      }
      try {
        const bundle = await loadAtomicDbAnalysisBundle(
          fen,
          databaseLineCount,
          databasePlyCount,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        databasePending = false;
        publishAtomicDbOrFallback(bundle.position, bundle.lines);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        databasePending = false;
        if (preview) {
          publishAtomicDbOrFallback(preview, previewLinesFor(preview));
          return;
        }
        if (fallbackToEngine) {
          startEngine(true);
          return;
        }
        publish((current) => ({
          ...current,
          status: "error",
          error: getErrorMessage(error, "AtomicDB analysis failed."),
        }));
      } finally {
        finishDatabaseRequest();
      }
    };

    const shouldDebounce = positionChanged && debounceMs > 0;
    const timeout = shouldDebounce
      ? window.setTimeout(() => void requestPosition(), debounceMs)
      : null;
    if (!shouldDebounce) void requestPosition();

    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      finishDatabaseRequest();
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
    atomicDbFollowUps,
    progressivePreview,
    storedPosition,
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

  if (!useAtomicStockfishOnly && storedPosition?.position) {
    const { databaseResult, linesForMoves } = createAnalysisMoveComposer(
      fen,
      requestedLineCount,
      requestedPlyCount,
    );
    const { position, lines } = databaseResult(
      storedPosition.position,
      storedPosition.principalVariations,
    );
    return {
      result: { fen, position },
      status: storedPosition.complete ? "ready" : "loading",
      error: "",
      principalVariations: linesForMoves(position.moves, atomicDbFollowUps ? lines : {}),
      source: "atomicdb",
    };
  }

  // Effects run after render. Immediately expose the transition without discarding the last
  // settled result, which prevents the evaluation bar and move list from flashing empty.
  return {
    result: state.result,
    status: "loading",
    error: "",
    principalVariations: state.requestedOptions === requestOptions ? state.principalVariations : {},
    source: useAtomicStockfishOnly ? "engine" : "atomicdb",
    ...(useAtomicStockfishOnly ? { engine: DEFAULT_LOCAL_ANALYSIS_ENGINE } : {}),
  };
};
