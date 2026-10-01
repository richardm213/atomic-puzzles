import type { PuzzleLeaderboardMetricRow } from "../supabase/puzzleUserRatings";
import type { PuzzleProgressWithUsernameRow } from "../supabase/types";
import {
  ALL_TIME_PUZZLE_MIN_ATTEMPTS,
  isPuzzleLeaderboardEligible,
  MONTHLY_PUZZLE_MAX_RD,
  MONTHLY_PUZZLE_MIN_ATTEMPTS,
  type PuzzleLeaderboardPeriod,
  rankPuzzleLeaderboardMetrics,
} from "../../../shared/domain/puzzles/puzzleLeaderboard";

export {
  ALL_TIME_PUZZLE_MIN_ATTEMPTS,
  isPuzzleLeaderboardEligible,
  MONTHLY_PUZZLE_MAX_RD,
  MONTHLY_PUZZLE_MIN_ATTEMPTS,
};
export type { PuzzleLeaderboardPeriod };

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

export const buildPuzzleLeaderboardRows = (
  metricRows: PuzzleLeaderboardMetricRow[],
  period: PuzzleLeaderboardPeriod,
): PuzzleLeaderboardRow[] => {
  return rankPuzzleLeaderboardMetrics(
    metricRows.filter((row) => row.username),
    period,
  ).map((row) => ({
    ...row,
    incorrect: Math.max(0, row.attempted - row.correct),
    percentCorrect: calculatePuzzleCorrectPercent(row.correct, row.attempted),
  }));
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
