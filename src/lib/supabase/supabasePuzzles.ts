import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows } from "./supabaseRows";
import { cachedRequest } from "../../utils/requestCache";
import type { RawPuzzleRow } from "../../types/puzzles";

export type PuzzleRow = RawPuzzleRow;

const PUZZLES_TABLE = import.meta.env.VITE_SUPABASE_PUZZLES_TABLE?.trim() ?? "puzzles";
const puzzleRowsCache = new Map<string, Promise<PuzzleRow[]>>();

const fetchUncachedPuzzleRowsFromSupabase = async (): Promise<PuzzleRow[]> => {
  const supabase = getSupabaseClient();
  return fetchAllSupabaseRows<PuzzleRow>(PUZZLES_TABLE, () =>
    supabase.from(PUZZLES_TABLE).select("*"),
  );
};

export const fetchPuzzleRowsFromSupabase = async (): Promise<PuzzleRow[]> =>
  cachedRequest(puzzleRowsCache, ["puzzles", PUZZLES_TABLE], fetchUncachedPuzzleRowsFromSupabase);
