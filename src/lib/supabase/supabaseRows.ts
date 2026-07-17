import type { PostgrestError } from "@supabase/supabase-js";

const MAX_CONCURRENT_SUPABASE_REQUESTS = 4;

let activeSupabaseRequests = 0;
const waitingSupabaseRequests: Array<() => void> = [];

type SupabaseQueryResult<TRow> = {
  data: TRow[] | null;
  error: PostgrestError | null;
  count?: number | null;
};

type SupabaseQuery<TRow> = PromiseLike<SupabaseQueryResult<TRow>>;

type RangeableQuery<TRow> = SupabaseQuery<TRow> & {
  range: (from: number, to: number) => SupabaseQuery<TRow>;
};

const acquireSupabaseRequestSlot = async (): Promise<void> => {
  if (activeSupabaseRequests < MAX_CONCURRENT_SUPABASE_REQUESTS) {
    activeSupabaseRequests += 1;
    return;
  }

  await new Promise<void>((resolve) => {
    waitingSupabaseRequests.push(resolve);
  });
};

const releaseSupabaseRequestSlot = (): void => {
  const nextRequest = waitingSupabaseRequests.shift();
  if (nextRequest) {
    nextRequest();
    return;
  }

  activeSupabaseRequests = Math.max(0, activeSupabaseRequests - 1);
};

const runLimitedSupabaseQuery = async <TRow>(
  query: SupabaseQuery<TRow>,
): Promise<SupabaseQueryResult<TRow>> => {
  await acquireSupabaseRequestSlot();
  try {
    return await query;
  } finally {
    releaseSupabaseRequestSlot();
  }
};

export const loadSupabaseRows = async <TRow>(
  tableName: string,
  query: SupabaseQuery<TRow>,
): Promise<TRow[]> => {
  const { data, error } = await runLimitedSupabaseQuery(query);
  if (error) {
    throw new Error(`Failed loading Supabase table "${tableName}": ${error.message}`);
  }
  return data ?? [];
};

export const loadSupabasePage = async <TRow>(
  tableName: string,
  query: SupabaseQuery<TRow>,
): Promise<{ rows: TRow[]; count: number | null | undefined }> => {
  const { data, error, count } = await runLimitedSupabaseQuery(query);
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
