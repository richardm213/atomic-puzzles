import { readFile, writeFile } from "node:fs/promises";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import {
  evaluationsForPositions,
  parseStoredAtomicDbPosition,
  type GameAnalysisSummary,
  type StoredAtomicDbPosition,
} from "../shared/domain/gameAnalysis";

const ATOMIC_DB_BASE_URL = "https://belzedar.duckdns.org/atomicdb";
const APPLY = process.argv.includes("--apply");
const GAME_ID =
  process.argv.find((argument) => argument.startsWith("--game="))?.slice("--game=".length) ?? null;
const REQUEST_INTERVAL_MS = 400;
const MAX_ATTEMPTS = 12;
const CACHE_PATH = "/tmp/atomic-game-analysis-depth-refresh.json";

type AnalysisRow = {
  game_id: string;
  result: GameAnalysisSummary | null;
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required.`);
  return value;
};

const supabase = createSupabaseClient(
  requiredEnvironment("VITE_SUPABASE_URL"),
  requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const positionKey = (fen: string): string => fen.trim().split(/\s+/).slice(0, 4).join(" ");
const isTerminal = (position: StoredAtomicDbPosition): boolean =>
  position.status === "WHITE_WIN" ||
  position.status === "BLACK_WIN" ||
  position.status === "DRAW" ||
  position.closure === "TERMINAL";

const loadReadyRows = async (): Promise<AnalysisRow[]> => {
  const rows: AnalysisRow[] = [];
  for (let from = 0; ; from += 1_000) {
    let query = supabase
      .from("game_analyses")
      .select("game_id,result")
      .eq("status", "ready")
      .order("game_id")
      .range(from, from + 999);
    if (GAME_ID) query = query.eq("game_id", GAME_ID);
    const { data, error } = await query;
    if (error) throw new Error(`Unable to load game analyses: ${error.message}`);
    rows.push(...((data ?? []) as AnalysisRow[]));
    if ((data?.length ?? 0) < 1_000 || GAME_ID) break;
  }
  return rows;
};

let nextRequestAt = 0;
const waitForRequestSlot = async (): Promise<void> => {
  const delay = Math.max(0, nextRequestAt - Date.now());
  nextRequestAt = Math.max(nextRequestAt, Date.now()) + REQUEST_INTERVAL_MS;
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
};

const retryDelay = (attempt: number, retryAfter: string | null): number => {
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(1_000, seconds * 1_000);
  return Math.min(60_000, 1_000 * 2 ** attempt);
};

const fetchPosition = async (fen: string): Promise<StoredAtomicDbPosition | null> => {
  const url = new URL(`${ATOMIC_DB_BASE_URL}/api/query`);
  url.searchParams.set("fen", fen);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    await waitForRequestSlot();
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 429 || response.status >= 500) {
      if (attempt + 1 === MAX_ATTEMPTS) {
        throw new Error(`AtomicDB returned ${response.status} for ${fen}.`);
      }
      await new Promise((resolve) =>
        setTimeout(resolve, retryDelay(attempt, response.headers.get("retry-after"))),
      );
      continue;
    }
    // AtomicDB can discard old, noncanonical searches. Keep the existing stored copy when a
    // historical position is no longer available instead of aborting the entire repair.
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`AtomicDB returned ${response.status} for ${fen}.`);
    const parsed = parseStoredAtomicDbPosition(fen, await response.json());
    if (!parsed) throw new Error(`AtomicDB returned an invalid position for ${fen}.`);
    return parsed;
  }
  throw new Error(`AtomicDB refresh failed for ${fen}.`);
};

const mapConcurrent = async <T>(
  values: T[],
  concurrency: number,
  callback: (value: T, index: number) => Promise<void>,
): Promise<void> => {
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (index < values.length) {
        const current = index++;
        await callback(values[current]!, current);
      }
    }),
  );
};

const main = async (): Promise<void> => {
  const rows = await loadReadyRows();
  const storedByKey = new Map<string, StoredAtomicDbPosition>();
  for (const row of rows) {
    for (const position of row.result?.positions ?? []) {
      if (!isTerminal(position)) storedByKey.set(positionKey(position.fen), position);
    }
  }

  console.log(
    JSON.stringify(
      {
        apply: APPLY,
        game: GAME_ID,
        analyses: rows.length,
        positions: rows.reduce((total, row) => total + (row.result?.positions.length ?? 0), 0),
        uniqueNonterminalPositions: storedByKey.size,
      },
      null,
      2,
    ),
  );
  if (!APPLY) return;

  const cache: Record<string, StoredAtomicDbPosition | null> = await readFile(CACHE_PATH, "utf8")
    .then((value) => JSON.parse(value) as Record<string, StoredAtomicDbPosition | null>)
    .catch(() => ({}));
  const refreshed = new Map<string, StoredAtomicDbPosition>();
  const unavailable = new Set<string>();
  for (const [key, position] of Object.entries(cache)) {
    if (position) refreshed.set(key, position);
    else unavailable.add(key);
  }
  const entries = [...storedByKey.entries()].filter(
    ([key]) => !Object.prototype.hasOwnProperty.call(cache, key),
  );
  let cacheWrite = Promise.resolve();
  let completedThisRun = 0;
  const saveCache = (): Promise<void> => {
    cacheWrite = cacheWrite.then(() => writeFile(CACHE_PATH, JSON.stringify(cache)));
    return cacheWrite;
  };
  console.log(
    `Resuming with ${refreshed.size + unavailable.size} cached positions; ${entries.length} remain.`,
  );
  await mapConcurrent(entries, 3, async ([key, position]) => {
    const fresh = await fetchPosition(position.fen);
    cache[key] = fresh;
    if (fresh) refreshed.set(key, fresh);
    else unavailable.add(key);
    completedThisRun += 1;
    const completed = refreshed.size + unavailable.size;
    if (completedThisRun % 50 === 0) await saveCache();
    if (completed % 100 === 0 || completed === storedByKey.size) {
      console.log(`Refetched ${completed} / ${storedByKey.size} unique positions.`);
    }
  });
  await saveCache();

  for (let index = 0; index < entries.length; index += 100) {
    const now = new Date().toISOString();
    const sharedRows = entries.slice(index, index + 100).flatMap(([key, stored]) => {
      const data = refreshed.get(key);
      return data
        ? [
            {
              fen_key: key,
              fen: stored.fen,
              request_status: "refreshed",
              task: null,
              completed: true,
              data,
              error: null,
              completed_at: now,
              updated_at: now,
            },
          ]
        : [];
    });
    if (sharedRows.length === 0) continue;
    const { error } = await supabase
      .from("game_analysis_positions")
      .upsert(sharedRows, { onConflict: "fen_key" });
    if (error) throw new Error(`Unable to update shared positions: ${error.message}`);
  }

  for (const row of rows) {
    if (!row.result) continue;
    const positions = row.result.positions.map((stored) => {
      const fresh = refreshed.get(positionKey(stored.fen));
      return fresh ? { ...fresh, fen: stored.fen } : stored;
    });
    const result: GameAnalysisSummary = {
      ...row.result,
      positions,
      evaluations: evaluationsForPositions(positions),
    };
    const { error } = await supabase
      .from("game_analyses")
      .update({ result, updated_at: new Date().toISOString() })
      .eq("game_id", row.game_id)
      .eq("status", "ready");
    if (error) throw new Error(`Unable to update ${row.game_id}: ${error.message}`);
  }

  const verified = await loadReadyRows();
  const invalid = verified.filter((row) =>
    (row.result?.positions ?? []).some((position) => {
      const fresh = refreshed.get(positionKey(position.fen));
      return (
        fresh !== undefined &&
        (position.status === "SKIPPED" ||
          (position.lines.length > 0 && position.lines.some((line) => line.depth === null)))
      );
    }),
  );
  if (invalid.length > 0) {
    throw new Error(`${invalid.length} analyses failed depth read-back verification.`);
  }
  console.log(
    `Refreshed ${refreshed.size} positions across ${verified.length} stored game analyses; ` +
      `${unavailable.size} historical positions were no longer available from AtomicDB.`,
  );
};

await main();
