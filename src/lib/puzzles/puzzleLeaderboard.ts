import {
  ALL_TIME_PUZZLE_MIN_ATTEMPTS,
  isPuzzleLeaderboardEligible,
  MONTHLY_PUZZLE_MAX_RD,
  MONTHLY_PUZZLE_MIN_ATTEMPTS,
  type PuzzleLeaderboardPeriod,
  rankPuzzleLeaderboardMetrics,
} from "../../../shared/domain/puzzles/puzzleLeaderboard";
import type { PuzzleLeaderboardMetricRow } from "../supabase/puzzleUserRatings";
import type { PuzzleProgressWithUsernameRow } from "../supabase/types";

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

const MAX_AVERAGE_ATTEMPT_DURATION_MS = 15 * 60 * 1_000;

const averagePuzzleSecondsByUsername = (
  progressRows: PuzzleProgressWithUsernameRow[],
  period: PuzzleLeaderboardPeriod,
  month: string,
): Map<string, number> => {
  const totals = new Map<string, { durationMs: number; count: number }>();
  filterPuzzleProgressRowsByPeriod(progressRows, period, month).forEach((row) => {
    const username = row.username.trim().toLowerCase();
    const durationMs = row.first_attempt_duration_ms;
    if (
      !username ||
      row.rated === false ||
      typeof durationMs !== "number" ||
      !Number.isFinite(durationMs) ||
      durationMs < 0 ||
      durationMs > MAX_AVERAGE_ATTEMPT_DURATION_MS
    ) {
      return;
    }
    const total = totals.get(username) ?? { durationMs: 0, count: 0 };
    total.durationMs += durationMs;
    total.count += 1;
    totals.set(username, total);
  });

  return new Map(
    [...totals].map(([username, total]) => [
      username,
      Math.round(total.durationMs / total.count / 1_000),
    ]),
  );
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
  progressRows: PuzzleProgressWithUsernameRow[] = [],
  month = "",
): PuzzleLeaderboardRow[] => {
  const averageSecondsByUsername = averagePuzzleSecondsByUsername(progressRows, period, month);
  return rankPuzzleLeaderboardMetrics(
    metricRows.filter((row) => row.username),
    period,
  ).map((row) => ({
    ...row,
    incorrect: Math.max(0, row.attempted - row.correct),
    percentCorrect: calculatePuzzleCorrectPercent(row.correct, row.attempted),
    averageSeconds:
      period === "all"
        ? (row.averageSeconds ?? null)
        : (averageSecondsByUsername.get(row.username.trim().toLowerCase()) ?? null),
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
