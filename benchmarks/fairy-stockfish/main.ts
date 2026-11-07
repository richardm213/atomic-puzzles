import {
  analyzeFairyStockfishPosition,
  type EngineCandidate,
} from "../../src/lib/practice/fairyStockfish";
import {
  isLocalAnalysisEngine,
  type LocalAnalysisEngine,
  localAnalysisEngineLabel,
} from "../../src/lib/practice/localAnalysisEngine";

const params = new URLSearchParams(window.location.search);
const requestedEngine = params.get("engine");
const engine: LocalAnalysisEngine = isLocalAnalysisEngine(requestedEngine)
  ? requestedEngine
  : "fairy-stockfish-14";

const SEARCH_TIME_MS = 3_000;
const LINE_COUNT = 3;
const POSITIONS = [
  { id: "fresh-01", fen: "1nbqk1nr/r1pppp2/6pb/pp5p/2NPP3/2P5/PP1B1PPP/R2QKBNR w KQk - 3 7" },
  { id: "fresh-02", fen: "1rbqkbnr/p2ppp2/np4pp/2p5/2P2P2/3P1N2/PPQ1PKPP/RNB2B1R w k - 0 7" },
  { id: "fresh-03", fen: "rnbqk2r/pppp3p/8/2b1ppp1/4PPn1/P2B4/1PPPN1PP/RNBQK2R w KQkq - 2 7" },
  { id: "fresh-04", fen: "1nbqkb1r/1r1ppppp/p6n/1p6/8/3P2P1/PPPNPP1P/R1BQKB1R w KQk - 1 7" },
  { id: "fresh-05", fen: "1rq1kbnr/p1p1pppp/n2p4/1p6/P2P4/N3P3/1PP2PPP/R1B1KB1R w KQk - 3 7" },
  { id: "fresh-06", fen: "rnbq1bnr/p1ppk3/1p3ppp/4p3/2P2P1P/8/PP1PP1P1/RNBQKBNR w KQ - 1 7" },
] as const;

type PositionResult = {
  id: string;
  fen: string;
  engineState: "cold" | "warm";
  firstResultMs: number;
  totalMs: number;
  depth: number | null;
  nodes: number | null;
  nps: number | null;
};

type BenchmarkResult = {
  schemaVersion: 1;
  benchmark: `${LocalAnalysisEngine}-analysis`;
  createdAt: string;
  config: { searchTimeMs: number; lineCount: number; uniquePositions: number };
  environment: {
    userAgent: string;
    hardwareConcurrency: number;
    deviceMemoryGb: number | null;
    crossOriginIsolated: boolean;
  };
  summary: {
    coldFirstResultMs: number;
    warmMedianFirstResultMs: number;
    warmMedianNps: number;
    totalMs: number;
  };
  positions: PositionResult[];
};

const runButton = document.querySelector<HTMLButtonElement>("#run");
const heading = document.querySelector<HTMLHeadingElement>("h1");
const status = document.querySelector<HTMLElement>("#status");
const resultsBody = document.querySelector<HTMLTableSectionElement>("#results");
const jsonOutput = document.querySelector<HTMLElement>("#json");

if (!runButton || !heading || !status || !resultsBody || !jsonOutput) {
  throw new Error("Benchmark page is missing required elements");
}

heading.textContent = document.title = `${localAnalysisEngineLabel(engine)} benchmark`;

const formatMs = (value: number): string => `${Math.round(value).toLocaleString()} ms`;
const formatInteger = (value: number | null): string => value?.toLocaleString() ?? "—";
const median = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
};

const bestMetrics = (
  candidates: EngineCandidate[],
): Pick<PositionResult, "depth" | "nodes" | "nps"> => {
  const primary = candidates.find((candidate) => candidate.multipv === 1);
  return {
    depth: primary?.depth ?? null,
    nodes: primary?.nodes ?? null,
    nps: primary?.nps ?? null,
  };
};

const renderRows = (completed: PositionResult[], activeIndex: number | null): void => {
  resultsBody.replaceChildren(
    ...POSITIONS.map((position, index) => {
      const result = completed[index];
      const row = document.createElement("tr");
      if (result) {
        row.innerHTML = `<td>${position.id}</td><td>${result.engineState}</td><td>${formatMs(result.firstResultMs)}</td><td>${formatMs(result.totalMs)}</td><td>${formatInteger(result.depth)}</td><td>${formatInteger(result.nodes)}</td><td>${formatInteger(result.nps)}</td>`;
      } else {
        const state = index === activeIndex ? "running" : "waiting";
        row.innerHTML = `<td>${position.id}</td><td class="pending">${state}</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>`;
      }
      return row;
    }),
  );
};

const postResult = async (result: BenchmarkResult): Promise<void> => {
  try {
    await fetch("/__fsf-benchmark-result", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
  } catch {
    // The page also works under the normal dev server, where no collector exists.
  }
};

const run = async (): Promise<void> => {
  runButton.disabled = true;
  const completed: PositionResult[] = [];
  renderRows(completed, 0);
  const suiteStartedAt = performance.now();

  try {
    for (const [index, position] of POSITIONS.entries()) {
      status.textContent = `Analyzing ${position.id} (${index + 1} of ${POSITIONS.length})…`;
      renderRows(completed, index);
      const startedAt = performance.now();
      let firstResultMs: number | null = null;
      const candidates = await analyzeFairyStockfishPosition(
        position.fen,
        LINE_COUNT,
        undefined,
        () => {
          firstResultMs ??= performance.now() - startedAt;
        },
        engine,
      );
      const totalMs = performance.now() - startedAt;
      completed.push({
        id: position.id,
        fen: position.fen,
        engineState: index === 0 ? "cold" : "warm",
        firstResultMs: firstResultMs ?? totalMs,
        totalMs,
        ...bestMetrics(candidates),
      });
    }

    const warmResults = completed.slice(1);
    const result: BenchmarkResult = {
      schemaVersion: 1,
      benchmark: `${engine}-analysis`,
      createdAt: new Date().toISOString(),
      config: {
        searchTimeMs: SEARCH_TIME_MS,
        lineCount: LINE_COUNT,
        uniquePositions: POSITIONS.length,
      },
      environment: {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemoryGb: "deviceMemory" in navigator ? Number(navigator.deviceMemory) : null,
        crossOriginIsolated: globalThis.crossOriginIsolated,
      },
      summary: {
        coldFirstResultMs: completed[0]?.firstResultMs ?? 0,
        warmMedianFirstResultMs: median(warmResults.map((item) => item.firstResultMs)),
        warmMedianNps: median(warmResults.flatMap((item) => (item.nps === null ? [] : [item.nps]))),
        totalMs: performance.now() - suiteStartedAt,
      },
      positions: completed,
    };

    renderRows(completed, null);
    jsonOutput.textContent = JSON.stringify(result, null, 2);
    status.textContent = `Complete. Warm median: ${formatInteger(Math.round(result.summary.warmMedianNps))} NPS.`;
    await postResult(result);
    runButton.textContent = "Reload to run again";
    runButton.disabled = false;
    runButton.onclick = () => window.location.reload();
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Benchmark failed";
    runButton.textContent = "Reload to retry";
    runButton.disabled = false;
    runButton.onclick = () => window.location.reload();
  }
};

renderRows([], null);
if (requestedEngine !== null && !isLocalAnalysisEngine(requestedEngine)) {
  status.textContent = `Unknown engine: ${requestedEngine}`;
  runButton.disabled = true;
} else if (params.get("autorun") === "1") {
  void run();
} else {
  runButton.addEventListener("click", () => void run(), { once: true });
}
