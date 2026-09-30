import type { PuzzleLeaderboardMetricRow } from "../supabase/puzzleUserRatings";
import type { PuzzleProgressWithUsernameRow } from "../supabase/types";

export const MONTHLY_PUZZLE_MIN_ATTEMPTS = 20;
export const MONTHLY_PUZZLE_MAX_RD = 60;
export const ALL_TIME_PUZZLE_MIN_ATTEMPTS = 20;

export type PuzzleLeaderboardPeriod = "monthly" | "all";

export type PuzzleLeaderboardRow = PuzzleLeaderboardMetricRow & {
  rank: number | null;
  eligible: boolean;
  incorrect: number;
  percentCorrect: number;
};

export const calculatePuzzleCorrectPercent = (correct: number, attempted: number): number => {
  const normalizedCorrect = Math.max(0, Math.floor(Number(correct)) || 0);
  const normalizedAttempted = Math.max(normalizedCorrect, Math.floor(Number(attempted)) || 0);
  if (normalizedAttempted === 0) return 0;
  return Math.round((normalizedCorrect / normalizedAttempted) * 100);
};

export const isPuzzleLeaderboardEligible = (
  row: PuzzleLeaderboardMetricRow,
  period: PuzzleLeaderboardPeriod,
): boolean =>
  row.attempted >=
    (period === "monthly" ? MONTHLY_PUZZLE_MIN_ATTEMPTS : ALL_TIME_PUZZLE_MIN_ATTEMPTS) &&
  (period === "all" || row.ratingDeviation < MONTHLY_PUZZLE_MAX_RD);

export const buildPuzzleLeaderboardRows = (
  metricRows: PuzzleLeaderboardMetricRow[],
  period: PuzzleLeaderboardPeriod,
): PuzzleLeaderboardRow[] => {
  const normalizedRows = metricRows
    .filter((row) => row.username)
    .map((row) => ({
      ...row,
      incorrect: Math.max(0, row.attempted - row.correct),
      percentCorrect: calculatePuzzleCorrectPercent(row.correct, row.attempted),
      eligible: isPuzzleLeaderboardEligible(row, period),
    }));
  const eligibleRows = normalizedRows
    .filter((row) => row.eligible)
    .sort((left, right) => {
      if (left.rating !== right.rating) return right.rating - left.rating;
      if (left.ratingDeviation !== right.ratingDeviation) {
        return left.ratingDeviation - right.ratingDeviation;
      }
      if (left.attempted !== right.attempted) return right.attempted - left.attempted;
      return left.username.localeCompare(right.username);
    });
  const ranks = new Map<string, number>();
  let previousRating: number | null = null;
  let previousRank = 0;
  eligibleRows.forEach((row, index) => {
    const rank = previousRating === row.rating ? previousRank : index + 1;
    previousRating = row.rating;
    previousRank = rank;
    ranks.set(row.username, rank);
  });

  return normalizedRows.map((row) => ({ ...row, rank: ranks.get(row.username) ?? null }));
};

export const filterPuzzleProgressRowsByPeriod = (
  progressRows: PuzzleProgressWithUsernameRow[],
  period: PuzzleLeaderboardPeriod,
  month: string,
): PuzzleProgressWithUsernameRow[] => {
  if (period === "all") return progressRows;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  return progressRows.filter((row) => {
    const attemptedAt = new Date(row?.first_attempt_at ?? "");
    return !Number.isNaN(attemptedAt.getTime()) && attemptedAt.toISOString().slice(0, 7) === month;
  });
};

export const puzzleTrophyLevel = (rank: number | null): "gold" | "red" | "silver" | null => {
  if (rank === 1) return "gold";
  if (rank === 2) return "red";
  if (rank !== null && rank <= 10) return "silver";
  return null;
};
