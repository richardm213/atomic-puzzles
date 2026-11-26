import { fenAfterAtomicMove } from "../../../shared/domain/puzzles/solutionPgn";
import {
  type AtomicDbAnalysisBundle,
  type AtomicDbPosition,
  fetchAtomicDbAnalysisBundle,
} from "../../utils/atomicDb";
import { ApiError } from "../api/postApi";

const CACHE_TTL_MS = 5 * 60_000;
export const MAX_ATOMIC_DB_LINES = 5;
export const MAX_ATOMIC_DB_PLIES = 5;

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

  hasRequest(key: string): boolean {
    return this.requests.has(key);
  }

  load(key: string, loader: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
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
            if (!controller.signal.aborted) this.prime(key, value);
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
const previewPositions = new AtomicDbRequestStore<AtomicDbPosition>(128);
const analysisBundles = new AtomicDbRequestStore<AtomicDbAnalysisBundle>(64);
const variationLines = new AtomicDbRequestStore<string[]>(128);
const analysisBundleKey = (fen: string, lineCount: number, plyCount: number): string =>
  `${fen}\n${lineCount}\n${plyCount}`;
const variationLineKey = (fen: string, rootMove: string, plyCount: number): string =>
  `${fen}\n${rootMove}\n${plyCount}`;

const coveringBundleKeys = function* (fen: string, lineCount: number, plyCount: number) {
  for (let lines = lineCount; lines <= MAX_ATOMIC_DB_LINES; lines += 1) {
    for (let plies = plyCount; plies <= MAX_ATOMIC_DB_PLIES; plies += 1) {
      yield analysisBundleKey(fen, lines, plies);
    }
  }
};

export const peekAtomicDbAnalysisBundle = (
  fen: string,
  lineCount: number,
  plyCount: number,
): AtomicDbAnalysisBundle | null => {
  for (const key of coveringBundleKeys(fen, lineCount, plyCount)) {
    const cached = analysisBundles.peek(key);
    if (cached.found) return cached.value;
  }
  return null;
};

let rateLimit: { until: number; error: ApiError } | undefined;
const rememberRateLimit = (error: ApiError): void => {
  const until = Date.now() + (error.retryAfterMs || 2_000);
  if (!rateLimit || rateLimit.until < until) rateLimit = { until, error };
};

export type PreloadedAtomicDbGamePosition = {
  fen: string;
  position: AtomicDbPosition | null;
  principalVariations: Record<string, string[]>;
  complete?: boolean;
};

export const peekAtomicDbPosition = (fen: string): CacheLookup<AtomicDbPosition | null> => {
  const complete = positions.peek(fen);
  return complete.found ? complete : previewPositions.peek(fen);
};

export const peekAtomicDbVariationLines = (
  fen: string,
  rootMoves: string[],
  plyCount: number,
): Record<string, string[]> => {
  const lines: Record<string, string[]> = {};
  for (const rootMove of rootMoves) {
    const cached = variationLines.peek(variationLineKey(fen, rootMove, plyCount));
    if (cached.found) lines[rootMove] = cached.value;
  }
  return lines;
};

const primeContinuationVariationLines = (
  rootFen: string,
  lines: Record<string, string[]>,
  bundledPositions: Record<string, AtomicDbPosition>,
  plyCount: number,
): void => {
  for (const line of Object.values(lines)) {
    let currentFen = rootFen;
    for (let moveIndex = 0; moveIndex < line.length; moveIndex += 1) {
      const nextFen = fenAfterAtomicMove(currentFen, line[moveIndex]!);
      if (!nextFen) break;

      const continuation = line.slice(moveIndex + 1, moveIndex + 1 + plyCount);
      const nextMove = continuation[0];
      if (nextMove && bundledPositions[nextFen]) {
        variationLines.prime(variationLineKey(nextFen, nextMove, plyCount), continuation);
      }
      currentFen = nextFen;
    }
  }
};

export const loadAtomicDbAnalysisBundle = async (
  fen: string,
  lineCount: number,
  plyCount: number,
  signal: AbortSignal,
): Promise<AtomicDbAnalysisBundle> => {
  signal.throwIfAborted();
  const cached = peekAtomicDbAnalysisBundle(fen, lineCount, plyCount);
  if (cached) return cached;
  const exactKey = analysisBundleKey(fen, lineCount, plyCount);
  // A root lookup can preview an in-flight variation bundle only if it runs independently.
  const batchKey =
    plyCount === 1
      ? exactKey
      : ([...coveringBundleKeys(fen, lineCount, plyCount)].find((key) =>
          analysisBundles.hasRequest(key),
        ) ?? exactKey);
  return analysisBundles.load(
    batchKey,
    async (sharedSignal) => {
      if (rateLimit && Date.now() < rateLimit.until) throw rateLimit.error;
      rateLimit = undefined;
      let result: AtomicDbAnalysisBundle;
      try {
        result = await fetchAtomicDbAnalysisBundle(fen, lineCount, plyCount, sharedSignal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 429) rememberRateLimit(error);
        throw error;
      }
      sharedSignal.throwIfAborted();
      positions.prime(fen, result.position);
      for (const [rootMove, line] of Object.entries(result.lines)) {
        variationLines.prime(variationLineKey(fen, rootMove, plyCount), line);
      }
      primeContinuationVariationLines(fen, result.lines, result.positions, plyCount);
      for (const [positionFen, position] of Object.entries(result.positions)) {
        previewPositions.prime(positionFen, position);
      }
      return result;
    },
    signal,
  );
};
