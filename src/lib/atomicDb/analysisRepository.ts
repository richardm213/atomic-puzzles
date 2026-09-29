import {
  type AtomicDbPosition,
  type AtomicDbPrincipalVariationResult,
  fetchAtomicDbPosition,
  fetchAtomicDbPrincipalVariations,
} from "../../utils/atomicDb";

const CACHE_TTL_MS = 5 * 60_000;

type CacheEntry<T> = { value: T; expiresAt: number };
type SharedRequest<T> = {
  controller: AbortController;
  promise: Promise<T>;
  consumers: number;
  abortTimer: ReturnType<typeof setTimeout> | null;
};

type CacheLookup<T> = { found: true; value: T } | { found: false };

class AtomicDbRequestStore<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly requests = new Map<string, SharedRequest<T>>();

  constructor(private readonly maxEntries: number) {}

  peek(key: string): CacheLookup<T> {
    const cached = this.cache.get(key);
    if (!cached) return { found: false };
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return { found: false };
    }

    this.cache.delete(key);
    this.cache.set(key, cached);
    return { found: true, value: cached.value };
  }

  prime(key: string, value: T): void {
    this.cache.delete(key);
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    if (this.cache.size <= this.maxEntries) return;

    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) this.cache.delete(oldestKey);
  }

  load(key: string, loader: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    const cached = this.peek(key);
    if (cached.found) return Promise.resolve(cached.value);

    let request = this.requests.get(key);
    if (!request) {
      const controller = new AbortController();
      const created: SharedRequest<T> = {
        controller,
        consumers: 0,
        abortTimer: null,
        promise: loader(controller.signal)
          .then((value) => {
            this.prime(key, value);
            return value;
          })
          .finally(() => {
            if (this.requests.get(key) === created) this.requests.delete(key);
          }),
      };
      this.requests.set(key, created);
      request = created;
    }

    return this.subscribe(key, request, signal);
  }

  private subscribe(key: string, request: SharedRequest<T>, signal: AbortSignal): Promise<T> {
    if (request.abortTimer !== null) {
      clearTimeout(request.abortTimer);
      request.abortTimer = null;
    }
    request.consumers += 1;

    return new Promise((resolve, reject) => {
      let settled = false;
      const release = (): void => {
        request.consumers = Math.max(0, request.consumers - 1);
        if (request.consumers !== 0 || this.requests.get(key) !== request) return;
        request.abortTimer = setTimeout(() => {
          if (request.consumers === 0 && this.requests.get(key) === request) {
            request.controller.abort();
            this.requests.delete(key);
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
          reject(reason instanceof Error ? reason : new Error("AtomicDB request failed."));
        },
      );
    });
  }
}

const positions = new AtomicDbRequestStore<AtomicDbPosition | null>(128);
const variationBatches = new AtomicDbRequestStore<AtomicDbPrincipalVariationResult>(64);
const variationLines = new AtomicDbRequestStore<string[]>(128);

const variationBatchKey = (fen: string, rootMoves: string[], plyCount: number): string =>
  `${fen}\n${rootMoves.join(",")}\n${plyCount}`;
const variationLineKey = (fen: string, rootMove: string, plyCount: number): string =>
  `${fen}\n${rootMove}\n${plyCount}`;

export const peekAtomicDbPosition = (fen: string): CacheLookup<AtomicDbPosition | null> =>
  positions.peek(fen);

export const loadAtomicDbPosition = (
  fen: string,
  signal: AbortSignal,
): Promise<AtomicDbPosition | null> =>
  positions.load(fen, (sharedSignal) => fetchAtomicDbPosition(fen, sharedSignal), signal);

export const loadAtomicDbVariations = async (
  fen: string,
  rootMoves: string[],
  plyCount: number,
  signal: AbortSignal,
): Promise<AtomicDbPrincipalVariationResult> => {
  const lines: Record<string, string[]> = {};
  const missingMoves = rootMoves.filter((rootMove) => {
    const cached = variationLines.peek(variationLineKey(fen, rootMove, plyCount));
    if (!cached.found) return true;
    lines[rootMove] = cached.value;
    return false;
  });
  if (missingMoves.length === 0) return { lines, positions: {} };

  const batchKey = variationBatchKey(fen, missingMoves, plyCount);
  const result = await variationBatches.load(
    batchKey,
    (sharedSignal) => fetchAtomicDbPrincipalVariations(fen, missingMoves, plyCount, sharedSignal),
    signal,
  );
  for (const rootMove of missingMoves) {
    const line = result.lines[rootMove] ?? [rootMove];
    lines[rootMove] = line;
    variationLines.prime(variationLineKey(fen, rootMove, plyCount), line);
  }
  for (const [positionFen, position] of Object.entries(result.positions)) {
    positions.prime(positionFen, position);
  }
  return { lines, positions: result.positions };
};
