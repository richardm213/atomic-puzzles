import { getSupabaseClient } from "./supabaseClient";
import { cachedRequest } from "../utils/requestCache";

const supabasePuzzleConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "",
  table: import.meta.env.VITE_SUPABASE_PUZZLES_TABLE?.trim() || "puzzles",
};
const puzzleRowsCache = new Map();

const requireSupabasePuzzleConfig = () => {
  const { url, anonKey } = supabasePuzzleConfig;
  if (!url || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  }
};

export const getSupabasePuzzlesTableName = () => supabasePuzzleConfig.table;

const fetchUncachedPuzzleRowsFromSupabase = async () => {
  requireSupabasePuzzleConfig();

  const { table } = supabasePuzzleConfig;
  const supabase = getSupabaseClient();
  const pageSize = 1000;
  let from = 0;
  const allRows = [];

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase.from(table).select("*").range(from, to);
    if (error) {
      throw new Error(`Failed loading Supabase table "${table}": ${error.message}`);
    }
    const pageRows = data;
    if (!Array.isArray(pageRows)) {
      throw new Error(`Expected Supabase table "${table}" to return an array`);
    }

    allRows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
};

export const fetchPuzzleRowsFromSupabase = async () =>
  cachedRequest(puzzleRowsCache, ["puzzles", supabasePuzzleConfig.table], () =>
    fetchUncachedPuzzleRowsFromSupabase(),
  );
