import { SPEED_PENALTY_CUTOFF_MS } from "./speedPenalty";

const STARTING_SPEED_BONUS = 1;
const ENDING_SPEED_BONUS = 0.2;
const FULL_SPEED_BONUS_DURATION_MS = 5_000;

export const calculateCorrectAttemptSpeedBonus = (
  puzzleLevel: number,
  attemptDurationMs: number | null,
): number => {
  if (
    !Number.isInteger(puzzleLevel) ||
    puzzleLevel < 1 ||
    puzzleLevel > 3 ||
    attemptDurationMs === null ||
    !Number.isFinite(attemptDurationMs) ||
    attemptDurationMs < 0 ||
    attemptDurationMs >= SPEED_PENALTY_CUTOFF_MS
  ) {
    return 0;
  }

  if (attemptDurationMs <= FULL_SPEED_BONUS_DURATION_MS) {
    return STARTING_SPEED_BONUS;
  }

  const progress =
    (attemptDurationMs - FULL_SPEED_BONUS_DURATION_MS) /
    (SPEED_PENALTY_CUTOFF_MS - FULL_SPEED_BONUS_DURATION_MS);
  return STARTING_SPEED_BONUS * Math.pow(STARTING_SPEED_BONUS / ENDING_SPEED_BONUS, -progress);
};
