import {
  type AtomicDbAnalysisBundle,
  type AtomicDbPosition,
  fetchAtomicDbAnalysisBundle,
  fetchAtomicDbPosition,
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
export type AtomicDbPositionCacheLookup =
  | {
      found: true;
      value: AtomicDbPosition | null;
      backed: false;
      preloaded: boolean;
      complete: boolean;
    }
  | {
      found: true;
      value: AtomicDbPosition;
      backed: true;
      preloaded: boolean;
      complete: boolean;
    }
  | { found: false };

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
const backedPositions = new AtomicDbRequestStore<AtomicDbPosition>(128);
const analysisBundles = new AtomicDbRequestStore<AtomicDbAnalysisBundle>(64);
const variationLines = new AtomicDbRequestStore<string[]>(128);
const preloadedGamePositions = new Map<
  string,
  { position: AtomicDbPosition | null; complete: boolean }
>();
const preloadedGameVariationLines = new Map<string, string[]>();

const analysisBundleKey = (fen: string, lineCount: number, plyCount: number): string =>
  `${fen}\n${lineCount}\n${plyCount}`;
const variationLineKey = (fen: string, rootMove: string, plyCount: number): string =>
  `${fen}\n${rootMove}\n${plyCount}`;

export type PreloadedAtomicDbGamePosition = {
  fen: string;
  position: AtomicDbPosition | null;
  principalVariations: Record<string, string[]>;
  complete?: boolean;
};

export const replacePreloadedAtomicDbGamePositions = (
  entries: PreloadedAtomicDbGamePosition[],
): void => {
  preloadedGamePositions.clear();
  preloadedGameVariationLines.clear();
  for (const { fen, position, principalVariations, complete = false } of entries) {
    preloadedGamePositions.set(fen, { position, complete });
    for (const move of position?.moves ?? []) {
      const line = principalVariations[move.uci] ?? [move.uci];
      for (let plyCount = 1; plyCount <= 5; plyCount += 1) {
        preloadedGameVariationLines.set(
          variationLineKey(fen, move.uci, plyCount),
          line.slice(0, plyCount),
        );
      }
    }
  }
};

export const clearPreloadedAtomicDbGamePositions = (): void => {
  preloadedGamePositions.clear();
  preloadedGameVariationLines.clear();
};

export const peekAtomicDbPosition = (fen: string): AtomicDbPositionCacheLookup => {
  if (preloadedGamePositions.has(fen)) {
    const preloaded = preloadedGamePositions.get(fen)!;
    return preloaded.position
      ? {
          found: true,
          value: preloaded.position,
          backed: true,
          preloaded: true,
          complete: preloaded.complete,
        }
      : {
          found: true,
          value: null,
          backed: false,
          preloaded: true,
          complete: preloaded.complete,
        };
  }
  const complete = positions.peek(fen);
  if (complete.found) return { ...complete, backed: false, preloaded: false, complete: true };
  const backed = backedPositions.peek(fen);
  return backed.found ? { ...backed, backed: true, preloaded: false, complete: false } : backed;
};

export const loadAtomicDbPosition = (
  fen: string,
  signal: AbortSignal,
): Promise<AtomicDbPosition | null> =>
  positions.load(fen, (sharedSignal) => fetchAtomicDbPosition(fen, sharedSignal), signal);

export const peekAtomicDbVariationLines = (
  fen: string,
  rootMoves: string[],
  plyCount: number,
): Record<string, string[]> => {
  const lines: Record<string, string[]> = {};
  for (const rootMove of rootMoves) {
    const preloaded = preloadedGameVariationLines.get(variationLineKey(fen, rootMove, plyCount));
    if (preloaded) {
      lines[rootMove] = preloaded;
      continue;
    }
    const cached = variationLines.peek(variationLineKey(fen, rootMove, plyCount));
    if (cached.found) lines[rootMove] = cached.value;
  }
  return lines;
};

export const loadAtomicDbAnalysisBundle = async (
  fen: string,
  lineCount: number,
  plyCount: number,
  signal: AbortSignal,
): Promise<AtomicDbAnalysisBundle> => {
  if (lineCount === 0) {
    const position = await loadAtomicDbPosition(fen, signal);
    return { position, lines: {}, positions: {} };
  }

  const batchKey = analysisBundleKey(fen, lineCount, plyCount);
  const result = await analysisBundles.load(
    batchKey,
    (sharedSignal) => fetchAtomicDbAnalysisBundle(fen, lineCount, plyCount, sharedSignal),
    signal,
  );
  positions.prime(fen, result.position);
  for (const rootMove of Object.keys(result.lines)) {
    const line = result.lines[rootMove] ?? [rootMove];
    variationLines.prime(variationLineKey(fen, rootMove, plyCount), line);
  }
  for (const [positionFen, position] of Object.entries(result.positions)) {
    backedPositions.prime(positionFen, position);
  }
  return result;
};
