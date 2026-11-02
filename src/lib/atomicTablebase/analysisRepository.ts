import { fetchAtomicTablebase, type AtomicTablebaseResult } from "../../utils/atomicTablebase";

const CACHE_TTL_MS = 30 * 60_000;

type CacheEntry = { value: AtomicTablebaseResult | null; expiresAt: number };
type SharedRequest = {
  controller: AbortController;
  promise: Promise<AtomicTablebaseResult | null>;
  consumers: number;
  abortTimer: ReturnType<typeof setTimeout> | null;
};

const cache = new Map<string, CacheEntry>();
const requests = new Map<string, SharedRequest>();

const prime = (fen: string, value: AtomicTablebaseResult | null): void => {
  cache.delete(fen);
  cache.set(fen, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  if (cache.size > 128) cache.delete(cache.keys().next().value!);
};

const subscribe = (
  fen: string,
  request: SharedRequest,
  signal: AbortSignal,
): Promise<AtomicTablebaseResult | null> => {
  if (request.abortTimer !== null) {
    clearTimeout(request.abortTimer);
    request.abortTimer = null;
  }
  request.consumers += 1;

  return new Promise((resolve, reject) => {
    let settled = false;
    const release = (): void => {
      request.consumers = Math.max(0, request.consumers - 1);
      if (request.consumers !== 0 || requests.get(fen) !== request) return;
      request.abortTimer = setTimeout(() => {
        if (request.consumers === 0 && requests.get(fen) === request) {
          request.controller.abort();
          requests.delete(fen);
        }
      }, 0);
    };
    const abort = (): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      release();
      const error = new Error("Aborted");
      error.name = "AbortError";
      reject(error);
    };

    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener("abort", abort, { once: true });
    request.promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        release();
        resolve(value);
      },
      (reason: unknown) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", abort);
        release();
        reject(reason instanceof Error ? reason : new Error("Tablebase request failed."));
      },
    );
  });
};

export const loadAtomicTablebase = (
  fen: string,
  signal: AbortSignal,
): Promise<AtomicTablebaseResult | null> => {
  const cached = cache.get(fen);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  if (cached) cache.delete(fen);

  let request = requests.get(fen);
  if (!request) {
    const controller = new AbortController();
    const created: SharedRequest = {
      controller,
      consumers: 0,
      abortTimer: null,
      promise: fetchAtomicTablebase(fen, controller.signal)
        .then((value) => {
          prime(fen, value);
          return value;
        })
        .finally(() => {
          if (requests.get(fen) === created) requests.delete(fen);
        }),
    };
    requests.set(fen, created);
    request = created;
  }

  return subscribe(fen, request, signal);
};
