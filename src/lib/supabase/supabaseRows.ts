import type { PostgrestError } from "@supabase/supabase-js";

const MIN_SUPABASE_REQUEST_INTERVAL_MS = 125;

let supabaseRequestQueue: Promise<unknown> = Promise.resolve();
let lastSupabaseRequestStart = 0;

type SupabaseQueryResult<TRow> = {
  data: TRow[] | null;
  error: PostgrestError | null;
  count?: number | null;
};

type SupabaseQuery<TRow> = PromiseLike<SupabaseQueryResult<TRow>>;

type RangeableQuery<TRow> = SupabaseQuery<TRow> & {
  range: (from: number, to: number) => SupabaseQuery<TRow>;
};

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });

const runQueuedSupabaseRequest = async <TRow>(
  query: SupabaseQuery<TRow>,
): Promise<SupabaseQueryResult<TRow>> => {
  const elapsed = Date.now() - lastSupabaseRequestStart;
  const waitMs = Math.max(0, MIN_SUPABASE_REQUEST_INTERVAL_MS - elapsed);
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastSupabaseRequestStart = Date.now();
  return query;
};

const queueSupabaseQuery = <TRow>(
  query: SupabaseQuery<TRow>,
): Promise<SupabaseQueryResult<TRow>> => {
  const run = async (): Promise<SupabaseQueryResult<TRow>> => runQueuedSupabaseRequest(query);

  const queuedRequest = supabaseRequestQueue.then(run, run);
  supabaseRequestQueue = queuedRequest.catch(() => {});
  return queuedRequest;
};

export const loadSupabaseRows = async <TRow>(
  tableName: string,
  query: SupabaseQuery<TRow>,
): Promise<TRow[]> => {
  const { data, error } = await queueSupabaseQuery(query);
  if (error) {
    throw new Error(`Failed loading Supabase table "${tableName}": ${error.message}`);
  }
  return data ?? [];
};

export const loadSupabasePage = async <TRow>(
  tableName: string,
  query: SupabaseQuery<TRow>,
): Promise<{ rows: TRow[]; count: number | null | undefined }> => {
  const { data, error, count } = await queueSupabaseQuery(query);
  if (error) {
    throw new Error(`Failed loading Supabase table "${tableName}": ${error.message}`);
  }
  return { rows: data ?? [], count };
};

export const fetchAllSupabaseRows = async <TRow>(
  tableName: string,
  buildQuery: () => RangeableQuery<TRow>,
  pageSize = 1000,
): Promise<TRow[]> => {
  const rows: TRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const page = await loadSupabaseRows(tableName, buildQuery().range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};
