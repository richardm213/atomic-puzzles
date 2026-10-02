import type { RawPuzzleRow } from "../../types/puzzles";
import { cachedRequest } from "../../utils/requestCache";
import { getSupabaseClient } from "./client";
import { fetchAllSupabaseRows, loadSupabaseRows } from "./rows";

export type PuzzleRow = RawPuzzleRow;

const PUZZLES_TABLE = import.meta.env.VITE_SUPABASE_PUZZLES_TABLE?.trim() ?? "puzzles";
const PUZZLE_SET_FIELDS = "id,event_name,event_date,players,source_id";
const PUZZLE_SET_RELATION = `puzzle_set:puzzle_sets!puzzles_puzzle_set_id_fkey(${PUZZLE_SET_FIELDS})`;
const PUZZLE_SET_MEMBERSHIP_RELATION = `puzzle_set_memberships(puzzle_set_id,puzzle_set:puzzle_sets(${PUZZLE_SET_FIELDS}))`;
const PUZZLE_SET_COLUMNS = `players,puzzle_set_id,${PUZZLE_SET_RELATION},${PUZZLE_SET_MEMBERSHIP_RELATION},white_player,black_player`;
const PUZZLE_RATING_RELATION =
  "rating_state:puzzle_ratings!puzzle_ratings_puzzle_id_fkey(rating,rating_deviation,attempts,successes,computed_level,human_level,human_rated_by,human_rated_at,updated_at)";
const PUZZLE_CATALOG_COLUMNS = `id,author,created_at,${PUZZLE_SET_COLUMNS},tags,opa_style,${PUZZLE_RATING_RELATION}`;
const PUZZLE_SOLVER_INDEX_COLUMNS = "id";
const PUZZLE_DETAIL_COLUMNS = `id,fen,solution,author,created_at,${PUZZLE_SET_COLUMNS},explanation,tags,opa_style,${PUZZLE_RATING_RELATION}`;
const MAX_PUZZLE_BATCH_SIZE = 12;
const puzzleCatalogCache = new Map<string, Promise<PuzzleRow[]>>();
const puzzleSolverIndexCache = new Map<string, Promise<PuzzleRow[]>>();
const puzzleDetailsCache = new Map<string, Promise<PuzzleRow[]>>();

export const clearPuzzleRatingCaches = (): void => {
  puzzleCatalogCache.clear();
  puzzleDetailsCache.clear();
};

const fetchUncachedPuzzleCatalogFromSupabase = async (): Promise<PuzzleRow[]> => {
  const supabase = getSupabaseClient();
  return fetchAllSupabaseRows<PuzzleRow>(PUZZLES_TABLE, () =>
    supabase.from(PUZZLES_TABLE).select(PUZZLE_CATALOG_COLUMNS).order("id"),
  );
};

export const fetchPuzzleCatalogFromSupabase = async (): Promise<PuzzleRow[]> =>
  cachedRequest(
    puzzleCatalogCache,
    ["puzzle-catalog", PUZZLES_TABLE],
    fetchUncachedPuzzleCatalogFromSupabase,
  );

/**
 * The solver only needs puzzle ids to choose an unattempted puzzle and build
 * its random queue. Keeping this separate from the richer set catalog avoids
 * downloading authors, tags, players, and two puzzle-set relations before the
 * first board can be shown.
 */
export const fetchPuzzleSolverIndexFromSupabase = async (): Promise<PuzzleRow[]> =>
  cachedRequest(puzzleSolverIndexCache, ["puzzle-solver-index", PUZZLES_TABLE], () => {
    const supabase = getSupabaseClient();
    return fetchAllSupabaseRows<PuzzleRow>(PUZZLES_TABLE, () =>
      supabase.from(PUZZLES_TABLE).select(PUZZLE_SOLVER_INDEX_COLUMNS).order("id"),
    );
  });

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
    supabase.from(PUZZLES_TABLE).select(PUZZLE_DETAIL_COLUMNS).in("id", puzzleIds),
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
