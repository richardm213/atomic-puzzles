import {
  ALL_TIME_PUZZLE_MIN_ATTEMPTS,
  isPuzzleLeaderboardEligible,
  MONTHLY_PUZZLE_MAX_RD,
  MONTHLY_PUZZLE_MIN_ATTEMPTS,
  puzzleActivityBonus,
  type PuzzleLeaderboardPeriod,
  rankPuzzleLeaderboardMetrics,
} from "../../../shared/domain/puzzles/puzzleLeaderboard";
import type { PuzzleLeaderboardMetricRow } from "../supabase/puzzleUserRatings";

export {
  ALL_TIME_PUZZLE_MIN_ATTEMPTS,
  isPuzzleLeaderboardEligible,
  MONTHLY_PUZZLE_MAX_RD,
  MONTHLY_PUZZLE_MIN_ATTEMPTS,
  puzzleActivityBonus,
};
export type { PuzzleLeaderboardPeriod };

export type PuzzleLeaderboardRow = PuzzleLeaderboardMetricRow & {
  rank: number | null;
  eligible: boolean;
  activityAttempts: number;
  activityBonus: number;
  leaderboardScore: number;
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
    averageSeconds: row.averageSeconds ?? null,
  }));
};

export const puzzleTrophyLevel = (rank: number | null): "gold" | "red" | "silver" | null => {
  if (rank === 1) return "gold";
  if (rank === 2) return "red";
  if (rank !== null && rank <= 10) return "silver";
  return null;
};
