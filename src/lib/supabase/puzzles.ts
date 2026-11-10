import type { RawPuzzleRow } from "../../types/puzzles";
import { cachedRequest } from "../../utils/requestCache";
import { apiRequest } from "../api/postApi";

export type PuzzleRow = RawPuzzleRow;

const puzzleCatalogCache = new Map<string, Promise<PuzzleRow[]>>();
const puzzleSolverIndexCache = new Map<string, Promise<PuzzleRow[]>>();

export const clearPuzzleRatingCaches = (): void => {
  puzzleCatalogCache.clear();
};

const fetchUncachedPuzzleCatalogFromSupabase = async (): Promise<PuzzleRow[]> => {
  const result = await apiRequest<{ rows: PuzzleRow[] }>(
    "/api/public-data?resource=puzzle-catalog",
    {
      errorMessage: "Unable to load the puzzle catalog.",
      invalidMessage: "The puzzle catalog service returned invalid data.",
    },
  );
  return result.rows;
};

export const fetchPuzzleCatalogFromSupabase = async (): Promise<PuzzleRow[]> =>
  cachedRequest(puzzleCatalogCache, ["puzzle-catalog"], fetchUncachedPuzzleCatalogFromSupabase);

/**
 * The solver needs ids and creator cooldown metadata to choose a rated puzzle and build
 * its random queue. Keeping this separate from the richer set catalog avoids
 * downloading tags, players, and two puzzle-set relations before the
 * first board can be shown.
 */
export const fetchPuzzleSolverIndexFromSupabase = async (): Promise<PuzzleRow[]> =>
  cachedRequest(puzzleSolverIndexCache, ["puzzle-solver-index"], async () => {
    const result = await apiRequest<{ rows: PuzzleRow[] }>(
      "/api/public-data?resource=puzzle-solver-index",
      {
        errorMessage: "Unable to load the puzzle index.",
        invalidMessage: "The puzzle index service returned invalid data.",
      },
    );
    return result.rows;
  });
