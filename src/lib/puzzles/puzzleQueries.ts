import { queryOptions } from "@tanstack/react-query";

import {
  fetchAllPuzzleProgressRows,
  fetchPuzzleProgressRowsForUsername,
} from "../supabase/puzzleProgress";
import { loadPuzzleCatalog } from "./puzzleLibrary";

export const puzzleQueryKeys = {
  catalog: ["puzzles", "catalog"] as const,
  progress: ["puzzle-progress"] as const,
};

export const puzzleCatalogQueryOptions = () =>
  queryOptions({
    queryKey: puzzleQueryKeys.catalog,
    queryFn: loadPuzzleCatalog,
    staleTime: 10 * 60 * 1_000,
  });

export const puzzleProgressForUserQueryOptions = (username: string) =>
  queryOptions({
    queryKey: [...puzzleQueryKeys.progress, "user", username] as const,
    queryFn: () => fetchPuzzleProgressRowsForUsername(username),
  });

export const puzzleLeaderboardProgressQueryOptions = () =>
  queryOptions({
    queryKey: [...puzzleQueryKeys.progress, "leaderboard"] as const,
    queryFn: fetchAllPuzzleProgressRows,
    staleTime: 30_000,
  });
