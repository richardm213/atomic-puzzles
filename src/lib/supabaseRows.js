const MIN_SUPABASE_REQUEST_INTERVAL_MS = 125;

let supabaseRequestQueue = Promise.resolve();
let lastSupabaseRequestStart = 0;

const sleep = (durationMs) =>
  new Promise((resolve) => {
    globalThis.setTimeout(resolve, durationMs);
  });

const runQueuedSupabaseRequest = (request) => {
  const run = async () => {
    const elapsed = Date.now() - lastSupabaseRequestStart;
    const waitMs = Math.max(0, MIN_SUPABASE_REQUEST_INTERVAL_MS - elapsed);
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    lastSupabaseRequestStart = Date.now();
    return request();
  };

  const queuedRequest = supabaseRequestQueue.then(run, run);
  supabaseRequestQueue = queuedRequest.catch(() => {});
  return queuedRequest;
};

export const assertSupabaseRows = (tableName, data) => {
  if (!Array.isArray(data)) {
    throw new Error(`Expected Supabase table "${tableName}" to return an array`);
  }
  return data;
};

export const loadSupabaseRows = async (tableName, query) => {
  const { data, error } = await runQueuedSupabaseRequest(() => query);
  if (error) {
    throw new Error(`Failed loading Supabase table "${tableName}": ${error.message}`);
  }
  return assertSupabaseRows(tableName, data);
};

export const loadSupabasePage = async (tableName, query) => {
  const { data, error, count } = await runQueuedSupabaseRequest(() => query);
  if (error) {
    throw new Error(`Failed loading Supabase table "${tableName}": ${error.message}`);
  }
  return { rows: assertSupabaseRows(tableName, data), count };
};

export const fetchAllSupabaseRows = async (tableName, buildQuery, pageSize = 1000) => {
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const page = await loadSupabaseRows(
      tableName,
      buildQuery().range(from, from + pageSize - 1),
    );
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};
