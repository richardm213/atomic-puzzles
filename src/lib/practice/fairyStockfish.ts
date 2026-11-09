import { acquireAtomicStockfishLease } from "./atomicStockfishLease";
import { type LocalAnalysisEngine, readLocalAnalysisEngine } from "./localAnalysisEngine";

type StockfishEngine = {
  addMessageListener: (listener: (line: string) => void) => void;
  dispose: () => void;
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

const enginePromises: Record<LocalAnalysisEngine, Promise<StockfishEngine> | null> = {
  "atomic-stockfish": null,
  "fairy-stockfish-14": null,
};
let engineSearchQueue: Promise<void> = Promise.resolve();
const configuredMultiPvCounts: Record<LocalAnalysisEngine, number> = {
  "atomic-stockfish": 1,
  "fairy-stockfish-14": 1,
};
type CachedEvaluation = {
  candidates: EngineCandidate[];
  expiresAt: number;
};
const evaluationCache = new Map<string, CachedEvaluation>();
// Match the shared AtomicDB repository window so analysis, game, and practice can reuse a recent
// local evaluation while moving between pages.
const EVALUATION_CACHE_TTL_MS = 5 * 60_000;
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

// MultiPV width is part of the request. Keeping it in the key prevents a deep one-line result
// from satisfying a later request for several independent lines.
export const fairyStockfishEvaluationCacheKey = (
  engine: LocalAnalysisEngine,
  fen: string,
  multiPvCount: number,
): string => `${engine}:${multiPvCount}:${fen}`;

const readCachedEvaluation = (
  engine: LocalAnalysisEngine,
  fen: string,
  multiPvCount: number,
): CachedEvaluation | null => {
  const key = fairyStockfishEvaluationCacheKey(engine, fen, multiPvCount);
  const cached = evaluationCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    evaluationCache.delete(key);
    return null;
  }
  evaluationCache.delete(key);
  evaluationCache.set(key, cached);
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

export const fairyStockfishEvaluationDepth = (candidates: EngineCandidate[]): number => {
  const depth = candidates.reduce(
    (shallowest, candidate) => Math.min(shallowest, candidate.depth ?? 0),
    Number.POSITIVE_INFINITY,
  );
  return depth === Number.POSITIVE_INFINITY ? 0 : depth;
};

export const isDeeperFairyStockfishEvaluation = (
  current: EngineCandidate[],
  candidate: EngineCandidate[],
): boolean =>
  candidate.length === current.length &&
  fairyStockfishEvaluationDepth(candidate) > fairyStockfishEvaluationDepth(current);

const cacheEvaluationIfDeepEnough = (
  engine: LocalAnalysisEngine,
  fen: string,
  candidates: EngineCandidate[],
  multiPvCount: number,
): void => {
  if (!isCacheableFairyStockfishEvaluation(candidates, multiPvCount)) return;
  const completeCandidates = [...candidates]
    .sort((left, right) => left.multipv - right.multipv)
    .slice(0, multiPvCount);

  const key = fairyStockfishEvaluationCacheKey(engine, fen, multiPvCount);
  const current = evaluationCache.get(key);
  if (current && !isDeeperFairyStockfishEvaluation(current.candidates, completeCandidates)) return;
  evaluationCache.delete(key);
  evaluationCache.set(key, {
    candidates: completeCandidates,
    expiresAt: Date.now() + EVALUATION_CACHE_TTL_MS,
  });
  if (evaluationCache.size > MAX_EVALUATION_CACHE_ENTRIES) {
    evaluationCache.delete(evaluationCache.keys().next().value!);
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
  const [{ default: stockfishScriptUrl }, { default: stockfishWasmUrl }] = await Promise.all([
    import("@lichess-org/stockfish-web/fsf_14.js?url"),
    import("@lichess-org/stockfish-web/fsf_14.wasm?url"),
  ]);
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
    dispose: () => module.uci("quit"),
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

type AtomicWorkerResponse =
  | { type: "ready" }
  | { type: "line"; line: string }
  | { type: "error"; message: string; fatal: boolean }
  | { type: "disposed" }
  | { type: "downloadProgress" }
  | { type: "search" };

const ATOMIC_STOCKFISH_WORKER_URL =
  "/engines/atomic-stockfish/01cc6f44f52709d3f4a0b0994d68f9226cc311fa/atomic-stockfish.worker.js";
const ATOMIC_STOCKFISH_NNUE_SHA256 =
  "99dc67eabf26a64faeeca3a88b4c38597a840b8d4a874b9f2cf658c6f92a04a6";

const atomicStockfishNetworkUrl = (): string => {
  const configuredUrl = import.meta.env.VITE_ATOMIC_STOCKFISH_NNUE_URL?.trim();
  if (configuredUrl) return configuredUrl;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!supabaseUrl) throw new Error("Atomic-Stockfish network URL is not configured");
  return `${supabaseUrl}/storage/v1/object/public/engine-assets/atomic-stockfish/v1.0/atomic-run3b-gzip.nnue`;
};

const initializeAtomicStockfish = async (): Promise<StockfishEngine> => {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
    throw new Error("Atomic-Stockfish requires cross-origin isolation");
  }

  const listeners = new Set<(line: string) => void>();
  let worker: Worker | null = null;
  let revoked = false;
  let rejectInitialization: ((reason?: unknown) => void) | null = null;
  let disposePromise: Promise<void> | null = null;
  let resolveDispose: (() => void) | null = null;
  let disposeTimeout: number | null = null;
  let lease: Awaited<ReturnType<typeof acquireAtomicStockfishLease>> | null = null;

  const finishDispose = (): void => {
    if (disposeTimeout !== null) window.clearTimeout(disposeTimeout);
    disposeTimeout = null;
    worker?.terminate();
    worker = null;
    resolveDispose?.();
    resolveDispose = null;
    lease?.release();
  };
  const disposeWorker = (): Promise<void> => {
    if (disposePromise) return disposePromise;
    if (!worker) {
      lease?.release();
      return Promise.resolve();
    }
    disposePromise = new Promise<void>((resolve) => {
      resolveDispose = resolve;
      worker?.postMessage({ type: "dispose" });
      disposeTimeout = window.setTimeout(finishDispose, 2_000);
    });
    return disposePromise;
  };

  lease = await acquireAtomicStockfishLease(async () => {
    revoked = true;
    enginePromises["atomic-stockfish"] = null;
    configuredMultiPvCounts["atomic-stockfish"] = 1;
    rejectInitialization?.(
      new DOMException("Atomic-Stockfish moved to the active tab", "AbortError"),
    );
    await disposeWorker();
  });
  if (revoked) throw new DOMException("Atomic-Stockfish moved to the active tab", "AbortError");

  worker = new Worker(ATOMIC_STOCKFISH_WORKER_URL, { type: "module" });
  worker.addEventListener("message", (event: MessageEvent<AtomicWorkerResponse>) => {
    const message = event.data;
    if (message.type === "disposed") finishDispose();
    if (message.type === "line") listeners.forEach((listener) => listener(message.line));
    if (message.type === "error" && !message.fatal) {
      console.error(`Atomic-Stockfish: ${message.message}`);
    }
  });

  try {
    await new Promise<void>((resolve, reject) => {
      rejectInitialization = reject;
      const handleMessage = (event: MessageEvent<AtomicWorkerResponse>): void => {
        const message = event.data;
        if (message.type === "ready") {
          worker?.removeEventListener("message", handleMessage);
          rejectInitialization = null;
          resolve();
          return;
        }
        if (message.type === "error" && message.fatal) {
          worker?.removeEventListener("message", handleMessage);
          rejectInitialization = null;
          reject(new Error(message.message));
        }
      };
      worker?.addEventListener("message", handleMessage);
      worker?.addEventListener(
        "error",
        () => reject(new Error("Atomic-Stockfish worker failed to load")),
        { once: true },
      );
      worker?.postMessage({
        type: "initialize",
        networkUrl: atomicStockfishNetworkUrl(),
        expectedSha256: ATOMIC_STOCKFISH_NNUE_SHA256,
        threads: Math.min(4, Math.max(1, navigator.hardwareConcurrency - 1)),
        hashMiB: 64,
        multiPv: 1,
      });
    });
  } catch (error) {
    await disposeWorker();
    throw error;
  }
  if (revoked) {
    await disposeWorker();
    throw new DOMException("Atomic-Stockfish moved to the active tab", "AbortError");
  }

  const engine: StockfishEngine = {
    addMessageListener: (listener) => listeners.add(listener),
    dispose: () => {
      void disposeWorker();
    },
    removeMessageListener: (listener) => listeners.delete(listener),
    postMessage: (command) => worker?.postMessage({ type: "command", command }),
  };
  engine.postMessage("setoption name UCI_Chess960 value true");
  const engineReady = waitForLine(engine, (line) => line === "readyok");
  engine.postMessage("isready");
  await engineReady;
  return engine;
};

const getEngine = (kind: LocalAnalysisEngine): Promise<StockfishEngine> => {
  enginePromises[kind] ??= (
    kind === "atomic-stockfish" ? initializeAtomicStockfish() : initializeEngine()
  ).catch((error) => {
    enginePromises[kind] = null;
    throw error;
  });
  return enginePromises[kind];
};

export const disposeInactiveLocalAnalysisEngine = (active: LocalAnalysisEngine): void => {
  const inactive: LocalAnalysisEngine =
    active === "atomic-stockfish" ? "fairy-stockfish-14" : "atomic-stockfish";
  const inactiveEngine = enginePromises[inactive];
  enginePromises[inactive] = null;
  configuredMultiPvCounts[inactive] = 1;
  if (inactiveEngine)
    void inactiveEngine.then(
      (engine) => engine.dispose(),
      () => undefined,
    );
};

const waitForBestMove = (
  engine: StockfishEngine,
  signal?: AbortSignal,
  requestedLineCount = 1,
  onProgress?: EngineProgressListener,
  stopWhen?: (candidates: EngineCandidate[]) => boolean,
): Promise<{ bestMoveLine: string; candidates: EngineCandidate[] }> =>
  new Promise((resolve, reject) => {
    const candidatesByRank = new Map<number, EngineCandidate>();
    let abortRequested = false;
    let stoppedEarly = false;
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
          if (
            !stoppedEarly &&
            candidatesByRank.size >= requestedLineCount &&
            stopWhen?.([...candidatesByRank.values()].sort((a, b) => a.multipv - b.multipv))
          ) {
            stoppedEarly = true;
            engine.postMessage("stop");
          }
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
  kind: LocalAnalysisEngine,
  fen: string,
  signal?: AbortSignal,
  thinkTimeMs = randomThinkTimeMs(),
  multiPvCount = MULTIPV_COUNT,
  onProgress?: EngineProgressListener,
  stopWhen?: (candidates: EngineCandidate[]) => boolean,
): Promise<{ bestMove: string | null; candidates: EngineCandidate[] }> => {
  let lastFailure: unknown = new Error("Fairy-Stockfish failed");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let engine: StockfishEngine | null = null;

    try {
      engine = await getEngine(kind);
      if (signal?.aborted) throw new DOMException("Engine search cancelled", "AbortError");

      if (configuredMultiPvCounts[kind] !== multiPvCount) {
        engine.postMessage(`setoption name MultiPV value ${multiPvCount}`);
        configuredMultiPvCounts[kind] = multiPvCount;
      }
      engine.postMessage(`position fen ${fen}`);
      const bestMoveResult = waitForBestMove(engine, signal, multiPvCount, onProgress, stopWhen);
      engine.postMessage(`go movetime ${thinkTimeMs}`);
      const { bestMoveLine, candidates } = await bestMoveResult;
      const fallbackMove = bestMoveLine.match(/^bestmove\s+(\S+)/)?.[1] ?? "";
      cacheEvaluationIfDeepEnough(kind, fen, candidates, multiPvCount);
      return {
        bestMove: fallbackMove && fallbackMove !== "(none)" ? fallbackMove : null,
        candidates,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;

      engine?.dispose();
      enginePromises[kind] = null;
      configuredMultiPvCounts[kind] = 1;
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
  engineOverride?: LocalAnalysisEngine,
  options: { refresh?: boolean; stopWhen?: (candidates: EngineCandidate[]) => boolean } = {},
): Promise<EngineCandidate[]> => {
  const engine = engineOverride ?? readLocalAnalysisEngine();
  const requestedLineCount = Math.min(MULTIPV_COUNT, Math.max(1, Math.floor(lineCount)));
  const cachedSearch = options.refresh
    ? null
    : readCachedEvaluation(engine, fen, requestedLineCount);
  let publishedCandidates = cachedSearch?.candidates ?? [];
  const handleProgress = (candidates: EngineCandidate[]): void => {
    cacheEvaluationIfDeepEnough(engine, fen, candidates, requestedLineCount);
    if (
      publishedCandidates.length === 0 ||
      isDeeperFairyStockfishEvaluation(publishedCandidates, candidates)
    ) {
      publishedCandidates = candidates;
      onProgress?.(candidates);
    }
  };
  const candidates = cachedSearch
    ? cachedSearch.candidates
    : (
        await queueFairyStockfishSearch(
          (requestSignal) =>
            searchFairyStockfish(
              engine,
              fen,
              requestSignal,
              MAX_THINK_TIME_MS,
              requestedLineCount,
              handleProgress,
              options.stopWhen,
            ),
          signal,
        )
      ).candidates;

  const latestCachedSearch = readCachedEvaluation(engine, fen, requestedLineCount);
  const preferredCandidates =
    latestCachedSearch &&
    isDeeperFairyStockfishEvaluation(candidates, latestCachedSearch.candidates)
      ? latestCachedSearch.candidates
      : candidates;

  return [...preferredCandidates]
    .sort((left, right) => left.multipv - right.multipv)
    .slice(0, requestedLineCount);
};

export const findFairyStockfishMove = (
  fen: string,
  signal?: AbortSignal,
  excludedMoves: ReadonlySet<string> = new Set(),
  engineOverride?: LocalAnalysisEngine,
): Promise<string | null> => {
  const engine = engineOverride ?? readLocalAnalysisEngine();
  const requestedLineCount = Math.min(
    MULTIPV_COUNT,
    Math.max(PRACTICE_MULTIPV_COUNT, excludedMoves.size + 1),
  );
  const cachedSearch = readCachedEvaluation(engine, fen, requestedLineCount);
  if (cachedSearch) {
    return Promise.resolve(
      chooseEngineCandidate(cachedSearch.candidates, Math.random, excludedMoves)?.move ?? null,
    );
  }

  return queueFairyStockfishSearch(async (requestSignal) => {
    const result = await searchFairyStockfish(
      engine,
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
