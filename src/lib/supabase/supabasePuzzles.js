import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows } from "./supabaseRows";
import { cachedRequest } from "../../utils/requestCache";

const PUZZLES_TABLE = import.meta.env.VITE_SUPABASE_PUZZLES_TABLE?.trim() || "puzzles";
const puzzleRowsCache = new Map();

const fetchUncachedPuzzleRowsFromSupabase = async () => {
  const supabase = getSupabaseClient();
  return fetchAllSupabaseRows(PUZZLES_TABLE, () => supabase.from(PUZZLES_TABLE).select("*"));
};

export const fetchPuzzleRowsFromSupabase = async () =>
  cachedRequest(puzzleRowsCache, ["puzzles", PUZZLES_TABLE], fetchUncachedPuzzleRowsFromSupabase);
