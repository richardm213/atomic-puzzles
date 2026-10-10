export const MONTHLY_PUZZLE_MIN_ATTEMPTS = 20;
export const MONTHLY_PUZZLE_MAX_RD = 60;
export const ALL_TIME_PUZZLE_MIN_ATTEMPTS = 20;
export const PUZZLE_ACTIVITY_BONUS_MAX = 50;
export const PUZZLE_ACTIVITY_BONUS_SCALE_ATTEMPTS = 500;

export type PuzzleLeaderboardPeriod = "monthly" | "all";

export type PuzzleLeaderboardMetric = {
  username: string;
  rating: number;
  ratingDeviation: number;
  attempted: number;
  correct: number;
  activityAttempts?: number;
  averageSeconds?: number | null;
};

export type RankedPuzzleLeaderboardMetric = PuzzleLeaderboardMetric & {
  rank: number | null;
  eligible: boolean;
  activityAttempts: number;
  activityBonus: number;
  leaderboardScore: number;
};

export const puzzleActivityBonus = (attempts: number): number => {
  const normalizedAttempts = Math.max(0, Number.isFinite(attempts) ? attempts : 0);
  return Math.min(
    PUZZLE_ACTIVITY_BONUS_MAX,
    Math.round(
      PUZZLE_ACTIVITY_BONUS_MAX *
        (1 - Math.exp(-normalizedAttempts / PUZZLE_ACTIVITY_BONUS_SCALE_ATTEMPTS)),
    ),
  );
};

export const isPuzzleLeaderboardEligible = (
  row: PuzzleLeaderboardMetric,
  period: PuzzleLeaderboardPeriod,
): boolean =>
  row.attempted >=
    (period === "monthly" ? MONTHLY_PUZZLE_MIN_ATTEMPTS : ALL_TIME_PUZZLE_MIN_ATTEMPTS) &&
  (period === "all" || row.ratingDeviation < MONTHLY_PUZZLE_MAX_RD);

export const rankPuzzleLeaderboardMetrics = (
  metricRows: PuzzleLeaderboardMetric[],
  period: PuzzleLeaderboardPeriod,
): RankedPuzzleLeaderboardMetric[] => {
  const normalizedRows = metricRows.map((row) => {
    const activityAttempts = Math.max(0, Math.round(row.activityAttempts ?? row.attempted));
    const activityBonus = puzzleActivityBonus(activityAttempts);
    return {
      ...row,
      activityAttempts,
      activityBonus,
      leaderboardScore: row.rating + activityBonus,
      eligible: isPuzzleLeaderboardEligible(row, period),
    };
  });
  const eligibleRows = normalizedRows
    .filter((row) => row.eligible)
    .sort((left, right) => {
      if (left.leaderboardScore !== right.leaderboardScore) {
        return right.leaderboardScore - left.leaderboardScore;
      }
      if (left.ratingDeviation !== right.ratingDeviation) {
        return left.ratingDeviation - right.ratingDeviation;
      }
      if (left.attempted !== right.attempted) return right.attempted - left.attempted;
      return left.username.localeCompare(right.username);
    });
  const ranks = new Map<string, number>();
  let previousScore: number | null = null;
  let previousRank = 0;
  eligibleRows.forEach((row, index) => {
    const rank = previousScore === row.leaderboardScore ? previousRank : index + 1;
    previousScore = row.leaderboardScore;
    previousRank = rank;
    ranks.set(row.username, rank);
  });

  return normalizedRows.map((row) => ({ ...row, rank: ranks.get(row.username) ?? null }));
};
