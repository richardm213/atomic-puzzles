import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const E4_FEN = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const E4_F6_FEN = "rnbqkbnr/ppppp1pp/5p2/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

const SCENARIOS = [
  { id: "general-start", fen: START_FEN },
  { id: "general-early", fen: E4_FEN },
  { id: "general-deeper", fen: E4_F6_FEN },
  {
    id: "general-date-filter",
    fen: START_FEN,
    params: { startDate: "2026-01", endDate: "2026-10" },
  },
  {
    id: "player-start",
    fen: START_FEN,
    params: { username: "gannet", color: "white", minRating: "1700" },
  },
  {
    id: "player-early",
    fen: E4_FEN,
    params: { username: "gannet", color: "white", minRating: "1700" },
  },
  {
    id: "head-to-head",
    fen: START_FEN,
    params: {
      username: "gannet",
      opponent: "camisapricity",
      color: "white",
      minRating: "1700",
    },
  },
];

const valueAfter = (name, fallback) => {
  const prefix = `--${name}=`;
  return (
    process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback
  );
};

const origin = valueAfter("origin", "https://atomicpuzzles.org").replace(/\/$/, "");
const runs = Math.max(1, Math.min(10, Number.parseInt(valueAfter("runs", "3"), 10) || 3));
const label = valueAfter("label", "live");

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};

const uncachedFen = (fen, sequence) => {
  const fields = fen.split(" ");
  // Halfmove/fullmove counters do not change the opening position key, but are
  // part of the request URL. This exercises the same DB rows without letting
  // browser or CDN response caches answer it.
  fields[4] = String(100 + ((Date.now() + sequence * 37) % 800));
  fields[5] = String(1000 + ((Date.now() + sequence * 101) % 8000));
  return fields.join(" ");
};

const benchmarkStartedAt = new Date();
const measurements = [];
let sequence = 0;

const serverDuration = (header) => {
  const value = /opening-explorer;dur=([0-9.]+)/.exec(header ?? "")?.[1];
  return value ? Number(value) : null;
};

for (let round = 1; round <= runs; round += 1) {
  for (const scenario of SCENARIOS) {
    sequence += 1;
    const params = new URLSearchParams({
      fen: uncachedFen(scenario.fen, sequence),
      speeds: "0,1,2",
      ...scenario.params,
    });
    const url = `${origin}/api/opening-explorer?${params}`;
    const startedAt = performance.now();
    const response = await fetch(url, {
      headers: { "X-Explorer-Intent": "visible" },
    });
    const text = await response.text();
    const totalMs = performance.now() - startedAt;
    let body = {};
    try {
      body = JSON.parse(text);
    } catch {
      // Status and response size remain useful in a failed benchmark result.
    }
    const cacheStatus = response.headers.get("cache-status") ?? "";
    measurements.push({
      scenario: scenario.id,
      round,
      status: response.status,
      totalMs,
      serverMs: serverDuration(response.headers.get("server-timing")),
      bytes: new TextEncoder().encode(text).byteLength,
      moves: Array.isArray(body.moves) ? body.moves.length : null,
      recentGames: Array.isArray(body.recentGames) ? body.recentGames.length : null,
      age: response.headers.get("age"),
      cacheStatus,
      cacheBypassed: !/\bhit\b/i.test(cacheStatus),
      error: typeof body.error === "string" ? body.error : null,
    });
    process.stdout.write(
      `${scenario.id.padEnd(21)} ${Math.round(totalMs).toString().padStart(5)} ms  ${response.status}\n`,
    );
  }
}

const scenarios = SCENARIOS.map(({ id }) => {
  const samples = measurements.filter((measurement) => measurement.scenario === id);
  return {
    id,
    medianMs: median(samples.map((sample) => sample.totalMs)),
    medianServerMs: samples.some((sample) => sample.serverMs !== null)
      ? median(samples.flatMap((sample) => (sample.serverMs === null ? [] : [sample.serverMs])))
      : null,
    minMs: Math.min(...samples.map((sample) => sample.totalMs)),
    maxMs: Math.max(...samples.map((sample) => sample.totalMs)),
    statuses: [...new Set(samples.map((sample) => sample.status))],
    responseCacheBypassed: samples.every((sample) => sample.cacheBypassed),
    moves: samples.at(-1)?.moves ?? null,
    recentGames: samples.at(-1)?.recentGames ?? null,
  };
});

const result = {
  schemaVersion: 1,
  benchmark: "turso-opening-explorer-loads",
  label,
  createdAt: benchmarkStartedAt.toISOString(),
  origin,
  config: {
    runs,
    speeds: [0, 1, 2],
    responseCacheStrategy: "unique FEN counters; identical 12-byte opening position key",
  },
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
  },
  scenarios,
  measurements,
};

const resultsDir = resolve("benchmarks/opening-explorer/results");
await mkdir(resultsDir, { recursive: true });
const safeTimestamp = result.createdAt.replaceAll(":", "-");
const outputPath = resolve(resultsDir, `${safeTimestamp}-${label}.json`);
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);

console.log("\nMedians");
for (const scenario of scenarios) {
  console.log(`  ${scenario.id.padEnd(21)} ${Math.round(scenario.medianMs)} ms`);
}
console.log(`\nSaved: ${outputPath}`);

if (measurements.some((measurement) => measurement.status !== 200)) process.exitCode = 1;
if (measurements.some((measurement) => !measurement.cacheBypassed)) {
  console.warn("Warning: at least one response appears to have come from an HTTP response cache.");
  process.exitCode = 1;
}
