import stockfishScriptUrl from "@lichess-org/stockfish-web/fsf_14.js?url";
import stockfishWasmUrl from "@lichess-org/stockfish-web/fsf_14.wasm?url";

type StockfishEngine = {
  addMessageListener: (listener: (line: string) => void) => void;
  removeMessageListener: (listener: (line: string) => void) => void;
  postMessage: (command: string) => void;
};

type StockfishWebModule = {
  uci: (command: string) => void;
  listen: (line: string) => void;
  onError: (message: string) => void;
};

type StockfishFactory = (options?: {
  locateFile?: (path: string) => string;
  mainScriptUrlOrBlob?: string;
  wasmMemory?: WebAssembly.Memory;
  listen?: (line: string) => void;
  onError?: (message: string) => void;
}) => Promise<StockfishWebModule>;

export type EngineCandidate = {
  move: string;
  multipv: number;
  scoreType: "cp" | "mate";
  score: number;
  depth?: number;
  nodes?: number;
  nps?: number;
  timeMs?: number;
  principalVariation?: string[];
};

type EngineProgressListener = (candidates: EngineCandidate[]) => void;

let enginePromise: Promise<StockfishEngine> | null = null;
let engineSearchQueue: Promise<void> = Promise.resolve();
let configuredMultiPvCount = 1;
type CachedEvaluation = {
  candidates: EngineCandidate[];
  multiPvCount: number;
  expiresAt: number;
};
const candidatesByFen = new Map<string, CachedEvaluation>();
const EVALUATION_CACHE_TTL_MS = 2 * 60_000;
const MAX_EVALUATION_CACHE_ENTRIES = 128;
const MIN_CACHED_EVALUATION_DEPTH = 15;
const MIN_THINK_TIME_MS = 500;
const MAX_THINK_TIME_MS = 3_000;
const PRACTICE_THINK_TIME_MS = 700;
const PRACTICE_MULTIPV_COUNT = 3;
const ENGINE_RESPONSE_TIMEOUT_MS = 15_000;
const ENGINE_SEARCH_TIMEOUT_MS = MAX_THINK_TIME_MS + 2_000;
const ENGINE_REQUEST_TIMEOUT_MS = 20_000;
const ENGINE_PROGRESS_INTERVAL_MS = 100;
const MAX_CANDIDATE_SCORE_GAP_CP = 150;
const MULTIPV_COUNT = 5;
const CANDIDATE_WEIGHTS = [0.4, 0.25, 0.15, 0.12, 0.08] as const;

const randomThinkTimeMs = (): number =>
  Math.floor(Math.random() * (MAX_THINK_TIME_MS - MIN_THINK_TIME_MS + 1)) + MIN_THINK_TIME_MS;

const readCachedEvaluation = (fen: string): CachedEvaluation | null => {
  const cached = candidatesByFen.get(fen);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    candidatesByFen.delete(fen);
    return null;
  }
  candidatesByFen.delete(fen);
  candidatesByFen.set(fen, cached);
  return cached;
};

export const isCacheableFairyStockfishEvaluation = (
  candidates: EngineCandidate[],
  multiPvCount: number,
): boolean => {
  const completeCandidates = [...candidates]
    .sort((left, right) => left.multipv - right.multipv)
    .slice(0, multiPvCount);
  return !(
    completeCandidates.length < multiPvCount ||
    completeCandidates.some((candidate) => (candidate.depth ?? 0) < MIN_CACHED_EVALUATION_DEPTH)
  );
};

const cacheEvaluationIfDeepEnough = (
  fen: string,
  candidates: EngineCandidate[],
  multiPvCount: number,
): void => {
  if (!isCacheableFairyStockfishEvaluation(candidates, multiPvCount)) return;
  const completeCandidates = [...candidates]
    .sort((left, right) => left.multipv - right.multipv)
    .slice(0, multiPvCount);

  candidatesByFen.delete(fen);
  candidatesByFen.set(fen, {
    candidates: completeCandidates,
    multiPvCount,
    expiresAt: Date.now() + EVALUATION_CACHE_TTL_MS,
  });
  if (candidatesByFen.size > MAX_EVALUATION_CACHE_ENTRIES) {
    candidatesByFen.delete(candidatesByFen.keys().next().value!);
  }
};

// Firefox's Atomics.waitAsync implementation currently leaks waiters under the
// pthread traffic produced by stockfish-web. Lichess disables it so Emscripten
// uses the stable synchronous Atomics.wait path instead.
type AtomicsWithWaitAsync = typeof Atomics & { waitAsync?: unknown };

export const disableFirefoxAtomicsWaitAsync = (
  userAgent = navigator.userAgent,
  atomics: AtomicsWithWaitAsync = Atomics,
): void => {
  if (!/Firefox\//.test(userAgent) || typeof atomics.waitAsync !== "function") return;
  Object.defineProperty(atomics, "waitAsync", {
    configurable: true,
    value: undefined,
    writable: true,
  });
};

const createSharedWasmMemory = (): WebAssembly.Memory => {
  const initial = 1_024;
  let maximum = 32_767;
  let shrinkDivisor = 4;
  while (true) {
    try {
      return new WebAssembly.Memory({ initial, maximum, shared: true });
    } catch (error) {
      if (maximum <= initial || !(error instanceof RangeError)) throw error;
      maximum = Math.max(initial, Math.ceil(maximum - maximum / shrinkDivisor));
      shrinkDivisor = shrinkDivisor === 4 ? 3 : 4;
    }
  }
};

export const withEngineRequestTimeout = <T>(
  request: Promise<T>,
  onTimeout: () => void,
  timeoutMs = ENGINE_REQUEST_TIMEOUT_MS,
): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      onTimeout();
      reject(new Error("Fairy-Stockfish stopped responding"));
    }, timeoutMs);

    request.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });

const comparableScore = (candidate: EngineCandidate): number => {
  if (candidate.scoreType === "cp") return candidate.score;
  return candidate.score > 0 ? 100_000 - candidate.score : -100_000 - candidate.score;
};

export const chooseEngineCandidate = (
  candidates: EngineCandidate[],
  random = Math.random,
  excludedMoves: ReadonlySet<string> = new Set(),
): EngineCandidate | null => {
  const rankedCandidates = [...candidates]
    .sort((a, b) => a.multipv - b.multipv)
    .slice(0, MULTIPV_COUNT);
  const bestCandidate = rankedCandidates[0];
  if (!bestCandidate) return null;

  if (bestCandidate.scoreType === "mate") {
    const availableCandidates = rankedCandidates.filter(
      (candidate) => !excludedMoves.has(candidate.move),
    );

    if (rankedCandidates.every((candidate) => candidate.scoreType === "mate")) {
      return availableCandidates[0] ?? null;
    }

    return (
      availableCandidates.find(
        (candidate) => candidate.scoreType === "mate" && candidate.score > 0,
      ) ?? null
    );
  }

  const bestScore = comparableScore(bestCandidate);
  const eligibleCandidates = rankedCandidates.filter(
    (candidate) =>
      bestScore - comparableScore(candidate) <= MAX_CANDIDATE_SCORE_GAP_CP &&
      !excludedMoves.has(candidate.move),
  );
  const eligibleWeights = eligibleCandidates.map(
    (candidate) => CANDIDATE_WEIGHTS[candidate.multipv - 1] ?? 0,
  );
  const totalWeight = eligibleWeights.reduce<number>((total, weight) => total + weight, 0);
  let roll = random() * totalWeight;

  for (let index = 0; index < eligibleCandidates.length; index += 1) {
    roll -= eligibleWeights[index] ?? 0;
    if (roll <= 0) return eligibleCandidates[index] ?? null;
  }

  return eligibleCandidates.at(-1) ?? null;
};

export const parseEngineCandidate = (line: string): EngineCandidate | null => {
  if (!line.startsWith("info ")) return null;
  // UCI permits omitting `multipv 1`; FSF does so for some primary-line updates.
  // Treating the missing field as NaN left our best line stuck at an old depth.
  const multipv = Number(line.match(/\bmultipv\s+(\d+)/)?.[1] ?? "1");
  const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  const principalVariation =
    line
      .match(/\bpv\s+(.+)$/)?.[1]
      ?.trim()
      .split(/\s+/)
      .filter((move) => /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(move)) ?? [];
  const move = principalVariation[0] ?? "";
  const depth = Number(line.match(/\bdepth\s+(\d+)/)?.[1]);
  const nodes = Number(line.match(/\bnodes\s+(\d+)/)?.[1]);
  const nps = Number(line.match(/\bnps\s+(\d+)/)?.[1]);
  const timeMs = Number(line.match(/\btime\s+(\d+)/)?.[1]);
  if (
    !Number.isInteger(multipv) ||
    multipv < 1 ||
    multipv > MULTIPV_COUNT ||
    !scoreMatch ||
    !move
  ) {
    return null;
  }
  return {
    move,
    multipv,
    scoreType: scoreMatch[1] as "cp" | "mate",
    score: Number(scoreMatch[2]),
    depth: Number.isInteger(depth) ? depth : 0,
    ...(Number.isInteger(nodes) ? { nodes } : {}),
    ...(Number.isInteger(nps) ? { nps } : {}),
    ...(Number.isInteger(timeMs) ? { timeMs } : {}),
    principalVariation,
  };
};

const waitForLine = (
  engine: StockfishEngine,
  matches: (line: string) => boolean,
  signal?: AbortSignal,
  timeoutMs = ENGINE_RESPONSE_TIMEOUT_MS,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Fairy-Stockfish stopped responding"));
    }, timeoutMs);
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      engine.removeMessageListener(handleLine);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleLine = (line: string): void => {
      if (!matches(line)) return;
      cleanup();
      resolve(line);
    };
    const handleAbort = (): void => {
      engine.postMessage("stop");
      cleanup();
      reject(new DOMException("Engine search cancelled", "AbortError"));
    };

    engine.addMessageListener(handleLine);
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) handleAbort();
  });

const initializeEngine = async (): Promise<StockfishEngine> => {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
    throw new Error("Fairy-Stockfish requires cross-origin isolation");
  }

  disableFirefoxAtomicsWaitAsync();

  const listeners = new Set<(line: string) => void>();
  const { default: factory } = (await import(/* @vite-ignore */ stockfishScriptUrl)) as {
    default: StockfishFactory;
  };
  const module = await factory({
    mainScriptUrlOrBlob: stockfishScriptUrl,
    locateFile: (path) => (path.endsWith(".wasm") ? stockfishWasmUrl : path),
    wasmMemory: createSharedWasmMemory(),
    listen: (line) => listeners.forEach((listener) => listener(line)),
    onError: (message) => console.error(`Fairy-Stockfish: ${message}`),
  });
  const engine: StockfishEngine = {
    addMessageListener: (listener) => listeners.add(listener),
    removeMessageListener: (listener) => listeners.delete(listener),
    postMessage: (command) => module.uci(command),
  };
  const uciReady = waitForLine(engine, (line) => line === "uciok");
  engine.postMessage("uci");
  await uciReady;
  engine.postMessage("setoption name UCI_Variant value atomic");
  engine.postMessage("setoption name UCI_AnalyseMode value true");
  engine.postMessage("setoption name Analysis Contempt value Off");
  engine.postMessage("setoption name UCI_Chess960 value true");
  engine.postMessage(
    `setoption name Threads value ${Math.min(4, Math.max(1, navigator.hardwareConcurrency - 1))}`,
  );
  engine.postMessage("setoption name Hash value 64");
  engine.postMessage("setoption name MultiPV value 1");
  engine.postMessage("ucinewgame");
  const engineReady = waitForLine(engine, (line) => line === "readyok");
  engine.postMessage("isready");
  await engineReady;
  return engine;
};

const getEngine = (): Promise<StockfishEngine> => {
  enginePromise ??= initializeEngine().catch((error) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
};

export const warmFairyStockfish = async (): Promise<void> => {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") return;
  try {
    await getEngine();
  } catch {
    // The real request reports initialization errors. Warming is best-effort.
  }
};

const waitForBestMove = (
  engine: StockfishEngine,
  signal?: AbortSignal,
  requestedLineCount = 1,
  onProgress?: EngineProgressListener,
): Promise<{ bestMoveLine: string; candidates: EngineCandidate[] }> =>
  new Promise((resolve, reject) => {
    const candidatesByRank = new Map<number, EngineCandidate>();
    let abortRequested = false;
    let lastProgressAt = Number.NEGATIVE_INFINITY;
    const timeout = window.setTimeout(() => {
      engine.postMessage("stop");
      cleanup();
      reject(new Error("Fairy-Stockfish search took too long"));
    }, ENGINE_SEARCH_TIMEOUT_MS);
    const cleanup = (): void => {
      window.clearTimeout(timeout);
      engine.removeMessageListener(handleLine);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleLine = (line: string): void => {
      if (line.startsWith("info ")) {
        const candidate = parseEngineCandidate(line);
        if (candidate) {
          candidatesByRank.set(candidate.multipv, candidate);
          const now = performance.now();
          if (
            onProgress &&
            candidate.multipv === requestedLineCount &&
            candidatesByRank.size >= requestedLineCount &&
            now - lastProgressAt >= ENGINE_PROGRESS_INTERVAL_MS
          ) {
            lastProgressAt = now;
            onProgress(
              [...candidatesByRank.values()]
                .sort((left, right) => left.multipv - right.multipv)
                .slice(0, requestedLineCount),
            );
          }
        }
        return;
      }
      if (!line.startsWith("bestmove ")) return;
      cleanup();
      if (abortRequested) {
        reject(new DOMException("Engine search cancelled", "AbortError"));
        return;
      }
      resolve({ bestMoveLine: line, candidates: [...candidatesByRank.values()] });
    };
    const handleAbort = (): void => {
      if (abortRequested) return;
      abortRequested = true;
      engine.postMessage("stop");
      // Keep listening until the matching bestmove arrives. Starting another
      // search before this response is drained can make its stale bestmove look
      // like the result of the new position and can leave isready blocked.
    };

    engine.addMessageListener(handleLine);
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) handleAbort();
  });

const searchFairyStockfish = async (
  fen: string,
  signal?: AbortSignal,
  thinkTimeMs = randomThinkTimeMs(),
  multiPvCount = MULTIPV_COUNT,
  onProgress?: EngineProgressListener,
): Promise<{ bestMove: string | null; candidates: EngineCandidate[] }> => {
  let lastFailure: unknown = new Error("Fairy-Stockfish failed");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let engine: StockfishEngine | null = null;

    try {
      engine = await getEngine();
      if (signal?.aborted) throw new DOMException("Engine search cancelled", "AbortError");

      if (configuredMultiPvCount !== multiPvCount) {
        engine.postMessage(`setoption name MultiPV value ${multiPvCount}`);
        configuredMultiPvCount = multiPvCount;
      }
      engine.postMessage(`position fen ${fen}`);
      const bestMoveResult = waitForBestMove(engine, signal, multiPvCount, onProgress);
      engine.postMessage(`go movetime ${thinkTimeMs}`);
      const { bestMoveLine, candidates } = await bestMoveResult;
      const fallbackMove = bestMoveLine.match(/^bestmove\s+(\S+)/)?.[1] ?? "";
      cacheEvaluationIfDeepEnough(fen, candidates, multiPvCount);
      return {
        bestMove: fallbackMove && fallbackMove !== "(none)" ? fallbackMove : null,
        candidates,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;

      engine?.postMessage("quit");
      enginePromise = null;
      configuredMultiPvCount = 1;
      lastFailure = error;

      const recoverable =
        error instanceof Error &&
        (error.message === "Fairy-Stockfish stopped responding" ||
          error.message === "Fairy-Stockfish search took too long");
      if (!recoverable || attempt > 0) throw error;
    }
  }

  throw lastFailure;
};

const queueFairyStockfishSearch = <T>(
  search: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  const requestController = new AbortController();
  const handleAbort = (): void => requestController.abort();
  signal?.addEventListener("abort", handleAbort, { once: true });
  if (signal?.aborted) handleAbort();

  // Fairy-Stockfish uses one shared UCI worker. Serialize every interaction so
  // rapid React effect cleanup/restarts cannot interleave stop/isready/go.
  const queuedSearch = engineSearchQueue.then(() => search(requestController.signal));
  engineSearchQueue = queuedSearch.then(
    () => undefined,
    () => undefined,
  );
  const request = withEngineRequestTimeout(queuedSearch, () => requestController.abort());
  return request.finally(() => signal?.removeEventListener("abort", handleAbort));
};

export const analyzeFairyStockfishPosition = async (
  fen: string,
  lineCount: number,
  signal?: AbortSignal,
  onProgress?: EngineProgressListener,
): Promise<EngineCandidate[]> => {
  const requestedLineCount = Math.min(MULTIPV_COUNT, Math.max(1, Math.floor(lineCount)));
  const cachedSearch = readCachedEvaluation(fen);
  const handleProgress = (candidates: EngineCandidate[]): void => {
    cacheEvaluationIfDeepEnough(fen, candidates, requestedLineCount);
    onProgress?.(candidates);
  };
  const candidates =
    cachedSearch && cachedSearch.multiPvCount >= requestedLineCount
      ? cachedSearch.candidates
      : (
          await queueFairyStockfishSearch(
            (requestSignal) =>
              searchFairyStockfish(
                fen,
                requestSignal,
                MAX_THINK_TIME_MS,
                requestedLineCount,
                handleProgress,
              ),
            signal,
          )
        ).candidates;

  return [...candidates]
    .sort((left, right) => left.multipv - right.multipv)
    .slice(0, requestedLineCount);
};

export const findFairyStockfishMove = (
  fen: string,
  signal?: AbortSignal,
  excludedMoves: ReadonlySet<string> = new Set(),
): Promise<string | null> => {
  const cachedSearch = readCachedEvaluation(fen);
  if (cachedSearch) {
    return Promise.resolve(
      chooseEngineCandidate(cachedSearch.candidates, Math.random, excludedMoves)?.move ?? null,
    );
  }

  const requestedLineCount = Math.min(
    MULTIPV_COUNT,
    Math.max(PRACTICE_MULTIPV_COUNT, excludedMoves.size + 1),
  );
  return queueFairyStockfishSearch(async (requestSignal) => {
    const result = await searchFairyStockfish(
      fen,
      requestSignal,
      PRACTICE_THINK_TIME_MS,
      requestedLineCount,
    );
    return (
      chooseEngineCandidate(result.candidates, Math.random, excludedMoves)?.move ?? result.bestMove
    );
  }, signal);
};
