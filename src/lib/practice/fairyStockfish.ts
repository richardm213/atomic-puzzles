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
  listen?: (line: string) => void;
  onError?: (message: string) => void;
}) => Promise<StockfishWebModule>;

export type EngineCandidate = {
  move: string;
  multipv: number;
  scoreType: "cp" | "mate";
  score: number;
  depth?: number;
  principalVariation?: string[];
};

let enginePromise: Promise<StockfishEngine> | null = null;
let engineSearchQueue: Promise<void> = Promise.resolve();
let configuredMultiPvCount = 1;
const candidatesByFen = new Map<
  string,
  { candidates: EngineCandidate[]; multiPvCount: number; thinkTimeMs: number }
>();
const MIN_THINK_TIME_MS = 500;
const MAX_THINK_TIME_MS = 3_000;
const PRACTICE_THINK_TIME_MS = 700;
const PRACTICE_MULTIPV_COUNT = 3;
const ENGINE_RESPONSE_TIMEOUT_MS = 15_000;
const ENGINE_SEARCH_TIMEOUT_MS = MAX_THINK_TIME_MS + 2_000;
const ENGINE_REQUEST_TIMEOUT_MS = 20_000;
const MAX_CANDIDATE_SCORE_GAP_CP = 150;
const MULTIPV_COUNT = 5;
const CANDIDATE_WEIGHTS = [0.4, 0.25, 0.15, 0.12, 0.08] as const;

const randomThinkTimeMs = (): number =>
  Math.floor(Math.random() * (MAX_THINK_TIME_MS - MIN_THINK_TIME_MS + 1)) + MIN_THINK_TIME_MS;

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

  const listeners = new Set<(line: string) => void>();
  const { default: factory } = (await import(/* @vite-ignore */ stockfishScriptUrl)) as {
    default: StockfishFactory;
  };
  const module = await factory({
    mainScriptUrlOrBlob: stockfishScriptUrl,
    locateFile: (path) => (path.endsWith(".wasm") ? stockfishWasmUrl : path),
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
): Promise<{ bestMoveLine: string; candidates: EngineCandidate[] }> =>
  new Promise((resolve, reject) => {
    const candidatesByRank = new Map<number, EngineCandidate>();
    let abortRequested = false;
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
        const multipv = Number(line.match(/\bmultipv\s+(\d+)/)?.[1]);
        const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
        const principalVariation =
          line
            .match(/\bpv\s+(.+)$/)?.[1]
            ?.trim()
            .split(/\s+/)
            .filter((move) => /^[a-h][1-8][a-h][1-8][nbrq]?$/.test(move)) ?? [];
        const move = principalVariation[0] ?? "";
        const depth = Number(line.match(/\bdepth\s+(\d+)/)?.[1]);
        if (
          Number.isInteger(multipv) &&
          multipv >= 1 &&
          multipv <= MULTIPV_COUNT &&
          scoreMatch &&
          move
        ) {
          candidatesByRank.set(multipv, {
            move,
            multipv,
            scoreType: scoreMatch[1] as "cp" | "mate",
            score: Number(scoreMatch[2]),
            depth: Number.isInteger(depth) ? depth : 0,
            principalVariation,
          });
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
      const bestMoveResult = waitForBestMove(engine, signal);
      engine.postMessage(`go movetime ${thinkTimeMs}`);
      const { bestMoveLine, candidates } = await bestMoveResult;
      const fallbackMove = bestMoveLine.match(/^bestmove\s+(\S+)/)?.[1] ?? "";
      candidatesByFen.set(fen, { candidates, multiPvCount, thinkTimeMs });
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
): Promise<EngineCandidate[]> => {
  const requestedLineCount = Math.min(MULTIPV_COUNT, Math.max(1, Math.floor(lineCount)));
  const cachedSearch = candidatesByFen.get(fen);
  const candidates =
    cachedSearch &&
    cachedSearch.thinkTimeMs >= MAX_THINK_TIME_MS &&
    cachedSearch.multiPvCount >= requestedLineCount
      ? cachedSearch.candidates
      : (
          await queueFairyStockfishSearch(
            (requestSignal) =>
              searchFairyStockfish(fen, requestSignal, MAX_THINK_TIME_MS, requestedLineCount),
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
  const cachedSearch = candidatesByFen.get(fen);
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
