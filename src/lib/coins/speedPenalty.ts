export const SPEED_PENALTY_CUTOFF_MS = 30_000;

const STARTING_SPEED_PENALTY = 3;
const ENDING_SPEED_PENALTY = 0.2;

export const calculateIncorrectAttemptSpeedPenalty = (attemptDurationMs: number | null): number => {
  if (
    attemptDurationMs === null ||
    !Number.isFinite(attemptDurationMs) ||
    attemptDurationMs < 0 ||
    attemptDurationMs >= SPEED_PENALTY_CUTOFF_MS
  ) {
    return 0;
  }

  const progress = attemptDurationMs / SPEED_PENALTY_CUTOFF_MS;
  return (
    STARTING_SPEED_PENALTY * Math.pow(STARTING_SPEED_PENALTY / ENDING_SPEED_PENALTY, -progress)
  );
};
