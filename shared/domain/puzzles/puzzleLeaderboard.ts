export const MONTHLY_PUZZLE_MIN_ATTEMPTS = 20;
export const MONTHLY_PUZZLE_MAX_RD = 60;
export const ALL_TIME_PUZZLE_MIN_ATTEMPTS = 20;

export type PuzzleLeaderboardPeriod = "monthly" | "all";

export type PuzzleLeaderboardMetric = {
  username: string;
  rating: number;
  ratingDeviation: number;
  attempted: number;
  correct: number;
  averageSeconds?: number | null;
};

export type RankedPuzzleLeaderboardMetric = PuzzleLeaderboardMetric & {
  rank: number | null;
  eligible: boolean;
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
  const normalizedRows = metricRows.map((row) => ({
    ...row,
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
