import type { PuzzleLevel } from "../../../shared/domain/puzzles/puzzleRating";

const rewardByLevel = { 1: 1, 2: 2, 3: 3, 4: 5, 5: 10 };
const penaltyByLevel = { 1: 5, 2: 3, 3: 1.5, 4: 0.5, 5: 0 };
const microcoins = 1_000_000;

// Preview a fresh graded run using the stakes in supabase/puzzle_grading_runs.sql.
export const testPuzzleCoinDelta = (
  level: PuzzleLevel,
  correct: boolean,
  misses: number,
  durationMs: number | null,
): number => {
  const factor = 0.5 ** misses;
  if (!correct) return -Math.trunc(penaltyByLevel[level] * factor * microcoins) / microcoins;
  if (misses >= 4) return 0;

  const speedBonus =
    misses === 0 && level <= 3 && durationMs !== null && durationMs < 30_000
      ? 5 ** (-Math.max(0, durationMs - 5_000) / 25_000)
      : 0;
  return Math.round((rewardByLevel[level] * factor + speedBonus) * microcoins) / microcoins;
};

type Rating = { rating: number; ratingDeviation: number };

// The preview uses the displayed deviations. The database uses their unrounded values.
const previewGlickoRating = (player: Rating, opponent: Rating, won: boolean): number => {
  const q = Math.log(10) / 400;
  const weight = 1 / Math.sqrt(1 + 3 * ((q * opponent.ratingDeviation) / Math.PI) ** 2);
  const expected = 1 / (1 + 10 ** ((-weight * (player.rating - opponent.rating)) / 400));
  const precision = 1 / player.ratingDeviation ** 2 + (q * weight) ** 2 * expected * (1 - expected);
  const change = ((q * weight) / precision) * (Number(won) - expected);
  return Math.max(800, Math.round(player.rating + change));
};

export const previewPuzzleRatingChanges = (user: Rating, puzzle: Rating, correct: boolean) => {
  const userRatingAfter = Math.min(3200, previewGlickoRating(user, puzzle, correct));
  return {
    userRatingAfter,
    userRatingChange: userRatingAfter - user.rating,
    puzzleRatingChange: previewGlickoRating(puzzle, user, !correct) - puzzle.rating,
  };
};
