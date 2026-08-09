import type { RawPuzzleRow } from "../../types/puzzles";
import { cachedRequest } from "../../utils/requestCache";
import { getSupabaseClient } from "./supabaseClient";
import { fetchAllSupabaseRows, loadSupabaseRows } from "./supabaseRows";

export type PuzzleRow = RawPuzzleRow;

const PUZZLES_TABLE = import.meta.env.VITE_SUPABASE_PUZZLES_TABLE?.trim() ?? "puzzles";
const PUZZLE_CATALOG_COLUMNS = "id,author,event,tags";
const PUZZLE_DETAIL_COLUMNS = "id,fen,solution,author,event,explanation,tags";
const MAX_PUZZLE_BATCH_SIZE = 12;
const puzzleCatalogCache = new Map<string, Promise<PuzzleRow[]>>();
const puzzleDetailsCache = new Map<string, Promise<PuzzleRow[]>>();

const onlyRowsWithSolutions = <
  TQuery extends {
    not: (column: string, operator: "is", value: null) => TQuery;
    neq: (column: string, value: string) => TQuery;
  },
>(
  query: TQuery,
): TQuery => query.not("solution", "is", null).neq("solution", "");

const fetchUncachedPuzzleCatalogFromSupabase = async (): Promise<PuzzleRow[]> => {
  const supabase = getSupabaseClient();
  return fetchAllSupabaseRows<PuzzleRow>(PUZZLES_TABLE, () =>
    onlyRowsWithSolutions(supabase.from(PUZZLES_TABLE).select(PUZZLE_CATALOG_COLUMNS)).order("id"),
  );
};

export const fetchPuzzleCatalogFromSupabase = async (): Promise<PuzzleRow[]> =>
  cachedRequest(
    puzzleCatalogCache,
    ["puzzle-catalog", PUZZLES_TABLE],
    fetchUncachedPuzzleCatalogFromSupabase,
  );

const normalizePuzzleIds = (puzzleIds: Array<number | string>): number[] =>
  [
    ...new Set(
      puzzleIds
        .map((puzzleId) => Number.parseInt(String(puzzleId), 10))
        .filter((puzzleId) => Number.isSafeInteger(puzzleId) && puzzleId > 0),
    ),
  ].slice(0, MAX_PUZZLE_BATCH_SIZE);

const fetchUncachedPuzzleRowsByIdFromSupabase = async (puzzleIds: number[]) => {
  if (puzzleIds.length === 0) return [];

  const supabase = getSupabaseClient();
  return loadSupabaseRows<PuzzleRow>(
    PUZZLES_TABLE,
    onlyRowsWithSolutions(supabase.from(PUZZLES_TABLE).select(PUZZLE_DETAIL_COLUMNS)).in(
      "id",
      puzzleIds,
    ),
  );
};

export const fetchPuzzleRowsByIdFromSupabase = async (
  puzzleIds: Array<number | string>,
): Promise<PuzzleRow[]> => {
  const normalizedIds = normalizePuzzleIds(puzzleIds);
  return cachedRequest(puzzleDetailsCache, ["puzzle-details", PUZZLES_TABLE, normalizedIds], () =>
    fetchUncachedPuzzleRowsByIdFromSupabase(normalizedIds),
  );
};
