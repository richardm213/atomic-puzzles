const supabasePuzzleConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "",
  table: import.meta.env.VITE_SUPABASE_PUZZLES_TABLE?.trim() || "puzzles",
};

const requireSupabasePuzzleConfig = () => {
  const { url, anonKey } = supabasePuzzleConfig;
  if (!url || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  }
};

export const getSupabasePuzzlesTableName = () => supabasePuzzleConfig.table;

export const fetchPuzzleRowsFromSupabase = async () => {
  requireSupabasePuzzleConfig();

  const { url, anonKey, table } = supabasePuzzleConfig;
  const baseUrl = url.replace(/\/$/, "");
  const pageSize = 1000;
  let offset = 0;
  const allRows = [];

  while (true) {
    const endpoint = `${baseUrl}/rest/v1/${encodeURIComponent(table)}?select=*&limit=${pageSize}&offset=${offset}`;
    const response = await fetch(endpoint, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while loading Supabase table "${table}"`);
    }

    const pageRows = await response.json();
    if (!Array.isArray(pageRows)) {
      throw new Error(`Expected Supabase table "${table}" to return an array`);
    }

    allRows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    offset += pageSize;
  }

  return allRows;
};
