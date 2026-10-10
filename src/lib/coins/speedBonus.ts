import { SPEED_PENALTY_CUTOFF_MS } from "./speedPenalty";

const STARTING_SPEED_BONUS = 1;
const ENDING_SPEED_BONUS = 0.1;

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

  const progress = attemptDurationMs / SPEED_PENALTY_CUTOFF_MS;
  return STARTING_SPEED_BONUS * Math.pow(STARTING_SPEED_BONUS / ENDING_SPEED_BONUS, -progress);
};
