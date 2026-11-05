import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { processGameAnalysisJob } from "../netlify/features/gameAnalysis/service";

const PAGE_SIZE = 1_000;
const STATUS_CHUNK_SIZE = 200;
const DEFAULT_POSITIONS_PER_JOB = 1;
const FULL_JOB_POSITION_LIMIT = 160;

type PendingAnalysisRow = {
  game_id: string;
  status?: "queued" | "processing" | "ready" | "failed";
  last_checked_at?: string | null;
};

const integerArgument = (name: string): number | null => {
  const raw = process.argv.find((argument) => argument.startsWith(`${name}=`))?.split("=")[1];
  if (raw === undefined) return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
};

const positionsPerJob = process.argv.includes("--full")
  ? FULL_JOB_POSITION_LIMIT
  : (integerArgument("--positions-per-job") ?? DEFAULT_POSITIONS_PER_JOB);
const requestedLimit = integerArgument("--limit");

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be loaded before running this script.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const loadOverdueGameIds = async (dueBefore: string): Promise<string[]> => {
  const ids: string[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const remaining = requestedLimit === null ? PAGE_SIZE : requestedLimit - ids.length;
    if (remaining <= 0) break;
    const pageSize = Math.min(PAGE_SIZE, remaining);
    const { data, error } = await supabase
      .from("game_analyses")
      .select("game_id")
      .in("status", ["queued", "processing"])
      .lte("next_check_at", dueBefore)
      .order("next_check_at", { ascending: true })
      .order("game_id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Unable to load overdue analyses: ${error.message}`);
    const rows = (data ?? []) as PendingAnalysisRow[];
    ids.push(...rows.map((row) => row.game_id));
    if (rows.length < pageSize) break;
  }
  return ids;
};

const loadUncheckedGameIds = async (
  client: SupabaseClient,
  gameIds: string[],
  startedAt: string,
): Promise<string[]> => {
  const unchecked: string[] = [];
  for (let index = 0; index < gameIds.length; index += STATUS_CHUNK_SIZE) {
    const { data, error } = await client
      .from("game_analyses")
      .select("game_id,status,last_checked_at")
      .in("game_id", gameIds.slice(index, index + STATUS_CHUNK_SIZE));
    if (error) throw new Error(`Unable to verify checked analyses: ${error.message}`);
    for (const row of (data ?? []) as PendingAnalysisRow[]) {
      if (
        (row.status === "queued" || row.status === "processing") &&
        (!row.last_checked_at || row.last_checked_at < startedAt)
      ) {
        unchecked.push(row.game_id);
      }
    }
  }
  return unchecked;
};

const runJobs = async (gameIds: string[], label: string): Promise<void> => {
  let completed = 0;
  for (const gameId of gameIds) {
    await processGameAnalysisJob(gameId, positionsPerJob, { submit: false });
    completed += 1;
    if (completed % 25 === 0 || completed === gameIds.length) {
      console.log(`${label}: ${completed}/${gameIds.length}`);
    }
  }
};

const main = async (): Promise<void> => {
  const startedAt = new Date().toISOString();
  const gameIds = await loadOverdueGameIds(startedAt);
  console.log(
    `Found ${gameIds.length} overdue analyses; checking up to ${positionsPerJob} position${positionsPerJob === 1 ? "" : "s"} per game.`,
  );
  if (gameIds.length === 0) return;

  await runJobs(gameIds, "Checked");

  // A scheduled worker can briefly hold a job lease. Retry anything from the original snapshot
  // that still has not recorded a check rather than silently leaving it behind.
  const unchecked = await loadUncheckedGameIds(supabase, gameIds, startedAt);
  if (unchecked.length > 0) {
    console.log(`Retrying ${unchecked.length} analyses skipped because another worker held them.`);
    await runJobs(unchecked, "Retried");
  }

  const stillUnchecked = await loadUncheckedGameIds(supabase, gameIds, startedAt);
  const { data: ready, error: readyError } = await supabase
    .from("game_analyses")
    .select("game_id,completed_at")
    .eq("status", "ready")
    .gte("completed_at", startedAt)
    .order("completed_at", { ascending: true });
  if (readyError) throw new Error(`Unable to load newly completed analyses: ${readyError.message}`);

  console.log(`Newly ready: ${ready?.length ?? 0}`);
  for (const row of ready ?? []) console.log(`  ${String(row.game_id)}`);
  console.log(`Original overdue snapshot still unchecked: ${stillUnchecked.length}`);
  if (stillUnchecked.length > 0) process.exitCode = 2;
};

await main();
