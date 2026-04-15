export const assertSupabaseRows = (tableName, data) => {
  if (!Array.isArray(data)) {
    throw new Error(`Expected Supabase table "${tableName}" to return an array`);
  }
  return data;
};

export const loadSupabaseRows = async (tableName, query) => {
  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed loading Supabase table "${tableName}": ${error.message}`);
  }
  return assertSupabaseRows(tableName, data);
};

export const loadSupabasePage = async (tableName, query) => {
  const { data, error, count } = await query;
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
