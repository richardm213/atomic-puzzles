const MIN_SUPABASE_REQUEST_INTERVAL_MS = 125;

let supabaseRequestQueue = Promise.resolve();
let lastSupabaseRequestStart = 0;

const sleep = (durationMs) =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });

const runQueuedSupabaseRequest = async (query) => {
  const elapsed = Date.now() - lastSupabaseRequestStart;
  const waitMs = Math.max(0, MIN_SUPABASE_REQUEST_INTERVAL_MS - elapsed);
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  lastSupabaseRequestStart = Date.now();
  return query;
};

const queueSupabaseQuery = (query) => {
  const run = async () => {
    return runQueuedSupabaseRequest(query);
  };

  const queuedRequest = supabaseRequestQueue.then(run, run);
  supabaseRequestQueue = queuedRequest.catch(() => {});
  return queuedRequest;
};

export const loadSupabaseRows = async (tableName, query) => {
  const { data, error } = await queueSupabaseQuery(query);
  if (error) {
    throw new Error(`Failed loading Supabase table "${tableName}": ${error.message}`);
  }
  return data ?? [];
};

export const loadSupabasePage = async (tableName, query) => {
  const { data, error, count } = await queueSupabaseQuery(query);
  if (error) {
    throw new Error(`Failed loading Supabase table "${tableName}": ${error.message}`);
  }
  return { rows: data ?? [], count };
};

export const fetchAllSupabaseRows = async (tableName, buildQuery, pageSize = 1000) => {
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const page = await loadSupabaseRows(tableName, buildQuery().range(from, from + pageSize - 1));
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};
