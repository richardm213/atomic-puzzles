import { appendFile, readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

import {
  loadGameAnalysisOpenings,
  openingEvaluationData,
  queryGameAnalysisVariations,
  refreshGameAnalysisOpenings,
} from "../netlify/features/gameAnalysis/openings";
import { createServerSupabase } from "../netlify/platform/environment";
import {
  alignGameAnalysisPositionFens,
  applyGameAnalysisOpeningReview,
  buildGameAnalysisSummary,
  evaluationsForPositions,
  fillStoredAtomicDbVariations,
  GAME_ANALYSIS_VARIATION_SIZE,
  gameAnalysisOpeningFens,
  gameAnalysisOpeningKey,
  gameAnalysisPositionKey,
  mergeGameAnalysisOpenings,
  referenceGameAnalysisOpenings,
  type PersistedGameAnalysisSummary,
  type StoredAtomicDbPosition,
} from "../shared/domain/gameAnalysis";
import {
  atomicLegalMoveCount,
  createAtomicPosition,
  fenAfterAtomicMove,
} from "../shared/domain/puzzles/solutionPgn";

const APPLY = process.argv.includes("--apply");
const COMPACT_ONLY = process.argv.includes("--compact-only");
const OPENINGS_ONLY = process.argv.includes("--openings-only");
const KEEP_INLINE_OPENINGS = process.argv.includes("--keep-inline-openings");
const argument = (name: string) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const GAME_ID = argument("game");
const CHECKPOINT = argument("checkpoint") ?? "/tmp/atomic-game-analysis-5x5.ndjson";
if (COMPACT_ONLY && (OPENINGS_ONLY || KEEP_INLINE_OPENINGS)) {
  throw new Error("--compact-only cannot be combined with another opening mode.");
}
const PAGE_SIZE = 20;
const REQUEST_INTERVAL_MS = 250;

type AnalysisRow = {
  game_id: string;
  updated_at: string;
  result: PersistedGameAnalysisSummary | null;
  position_fens: string[];
};
type CheckpointEntry = {
  key: string;
  position: StoredAtomicDbPosition | null;
  fetchedAt: string;
};

const supabase = createServerSupabase("Game analysis variation backfill");
const isFetchable = (position: StoredAtomicDbPosition): boolean =>
  position.status !== "SKIPPED" && position.closure !== "TERMINAL";

const hasShortVariations = (position: StoredAtomicDbPosition) => {
  const lines = position.candidates ?? [];
  if (lines.length < Math.min(atomicLegalMoveCount(position.fen), GAME_ANALYSIS_VARIATION_SIZE)) {
    return true;
  }
  return lines.some(({ pv }) => {
    if (pv.length >= GAME_ANALYSIS_VARIATION_SIZE) return false;
    let fen = position.fen;
    for (const move of pv) {
      const next = fenAfterAtomicMove(fen, move);
      if (!next) return true;
      fen = next;
    }
    return !createAtomicPosition(fen).outcome();
  });
};

const readyPages = async function* (): AsyncGenerator<AnalysisRow[]> {
  let lastId: string | null = null;
  for (;;) {
    let query = supabase
      .from("game_analyses")
      .select("game_id,updated_at,result,position_fens")
      .eq("status", "ready")
      .order("game_id")
      .limit(PAGE_SIZE);
    if (lastId !== null) query = query.gt("game_id", lastId);
    if (GAME_ID) query = query.eq("game_id", GAME_ID);
    const { data, error } = await query;
    if (error) throw new Error(`Unable to load saved games: ${error.message}`);
    const rows = (data ?? []) as AnalysisRow[];
    if (rows.length === 0) return;
    yield rows;
    if (rows.length < PAGE_SIZE || GAME_ID) return;
    lastId = rows.at(-1)!.game_id;
  }
};

let nextRequestAt = 0;
const waitForRequestSlot = async (): Promise<void> => {
  const now = Date.now();
  const delay = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(nextRequestAt, now) + REQUEST_INTERVAL_MS;
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
};

const retryMs = (value: string | null, attempt: number) => {
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(1_000, seconds * 1_000);
    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.max(1_000, date - Date.now());
  }
  return Math.min(60_000, 1_000 * 2 ** attempt);
};

const fetchWithRetry: typeof fetch = async (input, init) => {
  for (let attempt = 0; ; attempt += 1) {
    await waitForRequestSlot();
    let response: Response | undefined;
    try {
      response = await fetch(input, { ...init, signal: AbortSignal.timeout(20_000) });
      if ((response.status !== 429 && response.status < 500) || attempt === 7) return response;
    } catch (error) {
      if (attempt === 7) throw error;
    }
    const delay = retryMs(response?.headers.get("retry-after") ?? null, attempt);
    await response?.body?.cancel();
    nextRequestAt = Math.max(nextRequestAt, Date.now() + delay);
  }
};

const fetchPosition = (fen: string) =>
  queryGameAnalysisVariations(fen, AbortSignal.timeout(20_000), fetchWithRetry);

const loadCheckpoint = async () => {
  const cache = new Map<string, CheckpointEntry>();
  const contents = await readFile(CHECKPOINT, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  // An interrupted append may leave a partial last line. Preserve all complete entries.
  for (const line of contents.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as CheckpointEntry;
      if (entry.key && entry.fetchedAt) {
        if (entry.position) entry.position = fillStoredAtomicDbVariations(entry.position);
        cache.set(entry.key, entry);
      }
    } catch {
      console.warn("Ignoring an incomplete checkpoint entry.");
    }
  }
  if (contents && !contents.endsWith("\n")) await appendFile(CHECKPOINT, "\n");
  return cache;
};

const main = async () => {
  const catalog = gameAnalysisOpeningFens();
  if (OPENINGS_ONLY && !APPLY) {
    console.log(JSON.stringify({ apply: false, catalog: catalog.size }));
    return;
  }
  if (APPLY) {
    const refreshed = await refreshGameAnalysisOpenings(supabase, fetchPosition);
    console.log("Opening refresh:", refreshed);
    if (refreshed.failed > 0) throw new Error("Some openings failed to refresh; rerun to retry.");
  }
  if (OPENINGS_ONLY) return;

  const openings = APPLY
    ? openingEvaluationData(await loadGameAnalysisOpenings(supabase, catalog.keys()))
    : new Map<string, StoredAtomicDbPosition>();
  const cache =
    APPLY && !COMPACT_ONLY ? await loadCheckpoint() : new Map<string, CheckpointEntry>();
  console.log(`Resuming from ${cache.size} checkpoint entries.`);
  const unique = new Set<string>();
  const totals = {
    games: 0,
    saved: 0,
    openings: 0,
    refreshed: 0,
    unavailable: 0,
    short: 0,
    conflicts: 0,
  };
  let checkpointWrite = Promise.resolve();
  for await (const rows of readyPages()) {
    const pageKeys = new Map<string, string>();
    for (const { result, position_fens } of rows) {
      const aligned = alignGameAnalysisPositionFens(result?.positions ?? [], position_fens);
      for (const position of mergeGameAnalysisOpenings(aligned, openings)) {
        if (position.status === "SKIPPED") continue;
        if (gameAnalysisOpeningKey(position.fen)) {
          totals.openings += 1;
        } else if (!COMPACT_ONLY && isFetchable(position)) {
          const key = gameAnalysisPositionKey(position.fen);
          if (unique.has(key)) continue;
          unique.add(key);
          pageKeys.set(key, position.fen);
        }
      }
    }
    if (APPLY) {
      const pending = [...pageKeys].filter(([key]) => !cache.has(key));
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(pending.length, 5) }, async () => {
          while (next < pending.length) {
            const [key, fen] = pending[next++]!;
            const position = await fetchPosition(fen);
            const entry = { key, position, fetchedAt: new Date().toISOString() };
            checkpointWrite = checkpointWrite.then(() =>
              appendFile(CHECKPOINT, JSON.stringify(entry) + "\n"),
            );
            await checkpointWrite;
            cache.set(key, entry);
          }
        }),
      );

      const sharedRows = [...pageKeys].flatMap(([key, fen]) => {
        const entry = cache.get(key);
        if (!entry?.position) {
          totals.unavailable += 1;
          return [];
        }
        const position = entry.position;
        totals.refreshed += 1;
        if (hasShortVariations(position)) totals.short += 1;
        return [
          {
            fen_key: key,
            fen,
            request_status: "refreshed",
            task: null,
            completed: true,
            data: position,
            error: null,
            completed_at: entry.fetchedAt,
          },
        ];
      });
      for (let start = 0; start < sharedRows.length; start += 100) {
        const batch = sharedRows.slice(start, start + 100);
        const { data, error } = await supabase
          .from("game_analysis_positions")
          .upsert(batch, { onConflict: "fen_key" })
          .select("fen_key,completed_at");
        if (error) throw new Error(`Unable to refresh shared positions: ${error.message}`);
        const verified = new Map(data.map((row) => [row.fen_key, Date.parse(row.completed_at)]));
        if (batch.some((row) => verified.get(row.fen_key) !== Date.parse(row.completed_at))) {
          throw new Error(
            "Shared position verification failed; check the 5×5 migration is applied.",
          );
        }
      }

      for (const row of rows) {
        if (!row.result) continue;
        const positions = mergeGameAnalysisOpenings(row.result.positions, openings).map(
          (stored) => {
            if (!isFetchable(stored) || gameAnalysisOpeningKey(stored.fen)) return stored;
            const fresh = cache.get(gameAnalysisPositionKey(stored.fen))?.position;
            return fresh ? { ...fresh, fen: stored.fen } : stored;
          },
        );
        const moves = row.result.assessments.map(({ uci }) => uci);
        const result =
          positions.length === moves.length + 1
            ? applyGameAnalysisOpeningReview(buildGameAnalysisSummary(moves, positions), {
                wolfrandom: positions.some(({ closure }) => closure === "WOLFRANDOM_OPENING"),
              })
            : { ...row.result, positions, evaluations: evaluationsForPositions(positions) };
        const persisted = KEEP_INLINE_OPENINGS
          ? result
          : referenceGameAnalysisOpenings(result, openings);
        if (isDeepStrictEqual(row.result, JSON.parse(JSON.stringify(persisted)))) continue;
        const { data, error } = await supabase
          .from("game_analyses")
          .update({ result: persisted, updated_at: new Date().toISOString() })
          .eq("game_id", row.game_id)
          .eq("status", "ready")
          .eq("updated_at", row.updated_at)
          .select("game_id,result")
          .maybeSingle();
        if (error) throw new Error(`Unable to refresh ${row.game_id}: ${error.message}`);
        if (!data) {
          totals.conflicts += 1;
          console.warn(`Saved game ${row.game_id} changed during the refresh; rerun to retry it.`);
          continue;
        }
        const saved = data.result as PersistedGameAnalysisSummary;
        if (
          saved.positions.length !== persisted.positions.length ||
          saved.positions.some((position, i) => {
            const expected = persisted.positions[i]!;
            if (position.fen !== expected.fen) return true;
            if ("openingKey" in expected) {
              return (
                !("openingKey" in position) ||
                position.openingKey !== expected.openingKey ||
                saved.evaluations[i] !== null ||
                "candidates" in position ||
                "lines" in position
              );
            }
            return (
              "openingKey" in position ||
              JSON.stringify(position.candidates?.map(({ pv }) => pv)) !==
                JSON.stringify(expected.candidates?.map(({ pv }) => pv))
            );
          })
        ) {
          throw new Error(`Saved position read-back failed for ${row.game_id}.`);
        }
        totals.saved += 1;
      }
    }
    totals.games += rows.length;
    console.log(JSON.stringify({ apply: APPLY, ...totals, uniqueNonOpening: unique.size }));
  }
  if (totals.conflicts > 0) process.exitCode = 1;
};

await main();
