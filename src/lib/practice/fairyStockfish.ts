import stockfishScriptUrl from "fairy-stockfish-nnue.wasm/stockfish.js?url";
import stockfishWasmUrl from "fairy-stockfish-nnue.wasm/stockfish.wasm?url";
import stockfishWorkerUrl from "fairy-stockfish-nnue.wasm/stockfish.worker.js?url";

type StockfishModule = {
  addMessageListener: (listener: (line: string) => void) => void;
  removeMessageListener: (listener: (line: string) => void) => void;
  postMessage: (command: string) => void;
};

type StockfishFactory = (options?: {
  locateFile?: (path: string) => string;
  mainScriptUrlOrBlob?: string;
}) => Promise<StockfishModule>;

export type EngineCandidate = {
  move: string;
  multipv: number;
  scoreType: "cp" | "mate";
  score: number;
};

declare global {
  interface Window {
    Stockfish?: StockfishFactory;
  }
}

let enginePromise: Promise<StockfishModule> | null = null;
let scriptPromise: Promise<void> | null = null;
const candidatesByFen = new Map<string, EngineCandidate[]>();
const MIN_THINK_TIME_MS = 500;
const MAX_THINK_TIME_MS = 3_000;
const MAX_CANDIDATE_SCORE_GAP_CP = 150;
const MULTIPV_COUNT = 5;
const CANDIDATE_WEIGHTS = [0.4, 0.25, 0.15, 0.12, 0.08] as const;

const randomThinkTimeMs = (): number =>
  Math.floor(Math.random() * (MAX_THINK_TIME_MS - MIN_THINK_TIME_MS + 1)) + MIN_THINK_TIME_MS;

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

const loadStockfishScript = (): Promise<void> => {
  if (window.Stockfish) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = stockfishScriptUrl;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Fairy-Stockfish"));
    document.head.append(script);
  });
  return scriptPromise;
};

const waitForLine = (
  engine: StockfishModule,
  matches: (line: string) => boolean,
  signal?: AbortSignal,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const cleanup = (): void => {
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

const initializeEngine = async (): Promise<StockfishModule> => {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
    throw new Error("Fairy-Stockfish requires cross-origin isolation");
  }

  await loadStockfishScript();
  const factory = window.Stockfish;
  if (!factory) throw new Error("Fairy-Stockfish did not initialize");

  const engine = await factory({
    mainScriptUrlOrBlob: stockfishScriptUrl,
    locateFile: (path) => {
      if (path.endsWith(".wasm")) return stockfishWasmUrl;
      if (path.endsWith(".worker.js")) return stockfishWorkerUrl;
      return path;
    },
  });
  const uciReady = waitForLine(engine, (line) => line === "uciok");
  engine.postMessage("uci");
  await uciReady;
  engine.postMessage("setoption name UCI_Variant value atomic");
  engine.postMessage(`setoption name MultiPV value ${MULTIPV_COUNT}`);
  const engineReady = waitForLine(engine, (line) => line === "readyok");
  engine.postMessage("isready");
  await engineReady;
  return engine;
};

const getEngine = (): Promise<StockfishModule> => {
  enginePromise ??= initializeEngine();
  return enginePromise;
};

const waitForBestMove = (
  engine: StockfishModule,
  signal?: AbortSignal,
): Promise<{ bestMoveLine: string; candidates: EngineCandidate[] }> =>
  new Promise((resolve, reject) => {
    let cancelled = false;
    const candidatesByRank = new Map<number, EngineCandidate>();
    const cleanup = (): void => {
      engine.removeMessageListener(handleLine);
      signal?.removeEventListener("abort", handleAbort);
    };
    const handleLine = (line: string): void => {
      if (line.startsWith("info ")) {
        const multipv = Number(line.match(/\bmultipv\s+(\d+)/)?.[1]);
        const scoreMatch = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
        const move = line.match(/\bpv\s+(\S+)/)?.[1] ?? "";
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
          });
        }
        return;
      }
      if (!line.startsWith("bestmove ")) return;
      cleanup();
      if (cancelled) {
        reject(new DOMException("Engine search cancelled", "AbortError"));
      } else {
        resolve({ bestMoveLine: line, candidates: [...candidatesByRank.values()] });
      }
    };
    const handleAbort = (): void => {
      cancelled = true;
      engine.postMessage("stop");
    };

    engine.addMessageListener(handleLine);
    signal?.addEventListener("abort", handleAbort, { once: true });
    if (signal?.aborted) handleAbort();
  });

export const findFairyStockfishMove = async (
  fen: string,
  signal?: AbortSignal,
  excludedMoves: ReadonlySet<string> = new Set(),
): Promise<string | null> => {
  const cachedCandidates = candidatesByFen.get(fen);
  if (cachedCandidates) {
    return chooseEngineCandidate(cachedCandidates, Math.random, excludedMoves)?.move ?? null;
  }

  const engine = await getEngine();
  if (signal?.aborted) throw new DOMException("Engine search cancelled", "AbortError");

  engine.postMessage("ucinewgame");
  engine.postMessage(`position fen ${fen}`);
  const bestMoveResult = waitForBestMove(engine, signal);
  engine.postMessage(`go movetime ${randomThinkTimeMs()}`);
  const { bestMoveLine, candidates } = await bestMoveResult;
  const fallbackMove = bestMoveLine.match(/^bestmove\s+(\S+)/)?.[1] ?? "";
  candidatesByFen.set(fen, candidates);
  const move = chooseEngineCandidate(candidates, Math.random, excludedMoves)?.move ?? fallbackMove;
  return move && move !== "(none)" ? move : null;
};
