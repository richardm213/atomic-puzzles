import type { RawPuzzleRow } from "../../types/puzzles";
import { cachedRequest } from "../../utils/requestCache";
import { getSupabaseClient } from "./client";
import { fetchAllSupabaseRows } from "./rows";

export type PuzzleRow = RawPuzzleRow;

const PUZZLES_TABLE = import.meta.env.VITE_SUPABASE_PUZZLES_TABLE?.trim() ?? "puzzles";
const PUZZLE_SET_FIELDS = "id,event_name,event_date,players,source_id";
const PUZZLE_SET_RELATION = `puzzle_set:puzzle_sets!puzzles_puzzle_set_id_fkey(${PUZZLE_SET_FIELDS})`;
const PUZZLE_SET_MEMBERSHIP_RELATION = `puzzle_set_memberships(puzzle_set_id,puzzle_set:puzzle_sets(${PUZZLE_SET_FIELDS}))`;
const PUZZLE_SET_COLUMNS = `players,puzzle_set_id,${PUZZLE_SET_RELATION},${PUZZLE_SET_MEMBERSHIP_RELATION},white_player,black_player`;
const PUZZLE_RATING_RELATION =
  "rating_state:puzzle_ratings!puzzle_ratings_puzzle_id_fkey(rating,rating_deviation,attempts,successes,computed_level,human_level,human_rated_by,human_rated_at,updated_at)";
const PUZZLE_CATALOG_COLUMNS = `id,author,${PUZZLE_SET_COLUMNS},tags,opa_style,${PUZZLE_RATING_RELATION}`;
const PUZZLE_SOLVER_INDEX_COLUMNS = "id";
const puzzleCatalogCache = new Map<string, Promise<PuzzleRow[]>>();
const puzzleSolverIndexCache = new Map<string, Promise<PuzzleRow[]>>();

export const clearPuzzleRatingCaches = (): void => {
  puzzleCatalogCache.clear();
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
