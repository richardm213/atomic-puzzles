import { queryOptions } from "@tanstack/react-query";

import { fetchPrimaryPlayerNicknames } from "../supabase/playerNicknames";
import {
  fetchAllPuzzleProgressRows,
  fetchPuzzleProgressRowsForUsername,
} from "../supabase/puzzleProgress";
import {
  fetchAllPuzzleUserRatings,
  fetchPuzzleLeaderboard,
  fetchPuzzleRatingEventsForUsername,
  fetchPuzzleUserRating,
} from "../supabase/puzzleUserRatings";
import { loadPuzzleCatalog } from "./puzzleLibrary";

export const puzzleQueryKeys = {
  catalog: ["puzzles", "catalog"] as const,
  progress: ["puzzle-progress"] as const,
  userRating: ["puzzle-user-rating"] as const,
  ratingEvents: ["puzzle-rating-events"] as const,
  nicknames: ["puzzles", "player-nicknames"] as const,
};

export const puzzleCatalogQueryOptions = () =>
  queryOptions({
    queryKey: puzzleQueryKeys.catalog,
    queryFn: loadPuzzleCatalog,
    staleTime: 10 * 60 * 1_000,
  });

export const puzzlePlayerNicknamesQueryOptions = () =>
  queryOptions({
    queryKey: puzzleQueryKeys.nicknames,
    queryFn: fetchPrimaryPlayerNicknames,
    staleTime: 60 * 60 * 1_000,
  });

export const puzzleProgressForUserQueryOptions = (username: string) =>
  queryOptions({
    queryKey: [...puzzleQueryKeys.progress, "user", username] as const,
    queryFn: () => fetchPuzzleProgressRowsForUsername(username),
  });

export const puzzleUserRatingQueryOptions = (username: string) =>
  queryOptions({
    queryKey: [...puzzleQueryKeys.userRating, username] as const,
    queryFn: () => fetchPuzzleUserRating(username),
    staleTime: 30_000,
  });

export const puzzleUserRatingsQueryOptions = () =>
  queryOptions({
    queryKey: puzzleQueryKeys.userRating,
    queryFn: fetchAllPuzzleUserRatings,
    staleTime: 30_000,
  });

export const puzzleLeaderboardQueryOptions = (period: "monthly" | "all", month: string) =>
  queryOptions({
    queryKey: ["puzzle-rankings", period, period === "monthly" ? month : "all"] as const,
    queryFn: () => fetchPuzzleLeaderboard(period, month),
    staleTime: 30_000,
  });

export const puzzleRatingEventsQueryOptions = (username: string) =>
  queryOptions({
    queryKey: [...puzzleQueryKeys.ratingEvents, username] as const,
    queryFn: () => fetchPuzzleRatingEventsForUsername(username),
    staleTime: 30_000,
  });

export const puzzleLeaderboardProgressQueryOptions = () =>
  queryOptions({
    queryKey: [...puzzleQueryKeys.progress, "leaderboard"] as const,
    queryFn: fetchAllPuzzleProgressRows,
    staleTime: 30_000,
  });
