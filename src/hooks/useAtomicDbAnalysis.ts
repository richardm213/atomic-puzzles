import { useEffect, useRef, useState } from "react";

import {
  type AtomicDbPosition,
  type AtomicDbResult,
  fetchAtomicDbPosition,
} from "../utils/atomicDb";

export type AtomicDbAnalysisStatus = "idle" | "loading" | "ready" | "error";

export type AtomicDbAnalysisState = {
  result: AtomicDbResult | null;
  status: AtomicDbAnalysisStatus;
  error: string;
};

type RequestState = AtomicDbAnalysisState & {
  requestedFen: string | null;
};

const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHE_ENTRIES = 128;
const cache = new Map<string, { position: AtomicDbPosition | null; expiresAt: number }>();

const INITIAL_STATE: RequestState = {
  result: null,
  requestedFen: null,
  status: "idle",
  error: "",
};

const remember = (fen: string, position: AtomicDbPosition | null): void => {
  cache.delete(fen);
  cache.set(fen, { position, expiresAt: Date.now() + CACHE_TTL_MS });

  if (cache.size > MAX_CACHE_ENTRIES) {
    const oldestFen = cache.keys().next().value;
    if (oldestFen !== undefined) cache.delete(oldestFen);
  }
};

const readCache = (fen: string): AtomicDbPosition | null | undefined => {
  const cached = cache.get(fen);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    cache.delete(fen);
    return undefined;
  }

  cache.delete(fen);
  cache.set(fen, cached);
  return cached.position;
};

export const useAtomicDbAnalysis = (
  fen: string,
  enabled: boolean,
  debounceMs = 220,
): AtomicDbAnalysisState => {
  const [state, setState] = useState<RequestState>(INITIAL_STATE);
  const lastRequestAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastRequestAtRef.current = null;
      setState(INITIAL_STATE);
      return;
    }

    const cachedPosition = readCache(fen);
    if (cachedPosition !== undefined) {
      setState({
        result: { fen, position: cachedPosition },
        requestedFen: fen,
        status: "ready",
        error: "",
      });
      return;
    }

    const requestedAt = Date.now();
    const shouldDebounce =
      lastRequestAtRef.current !== null && requestedAt - lastRequestAtRef.current < debounceMs;
    lastRequestAtRef.current = requestedAt;

    const controller = new AbortController();
    setState((current) => ({
      ...current,
      requestedFen: fen,
      status: "loading",
      error: "",
    }));

    const request = async (): Promise<void> => {
      try {
        const position = await fetchAtomicDbPosition(fen, controller.signal);
        if (controller.signal.aborted) return;

        remember(fen, position);
        setState({
          result: { fen, position },
          requestedFen: fen,
          status: "ready",
          error: "",
        });
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

    const timeout = shouldDebounce ? window.setTimeout(() => void request(), debounceMs) : null;
    if (!shouldDebounce) void request();

    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      controller.abort();
    };
  }, [debounceMs, enabled, fen]);

  if (!enabled) return { result: null, status: "idle", error: "" };

  // Effects run after render. Treat a newly supplied FEN as loading immediately while keeping the
  // last settled result on screen until the matching request completes.
  if (state.requestedFen !== fen) {
    if (state.result?.fen === fen) {
      return { result: state.result, status: "ready", error: "" };
    }
    return { result: state.result, status: "loading", error: "" };
  }

  return { result: state.result, status: state.status, error: state.error };
};
