export const DAILY_PUZZLE_ATTEMPT_LIMIT = 200;

export const DAILY_PUZZLE_ATTEMPT_LIMIT_CODE = "daily_puzzle_attempt_limit";

export const DAILY_PUZZLE_ATTEMPT_LIMIT_MESSAGE =
  "You’ve reached today’s 200-puzzle limit. If you keep solving at this rate, you’ll run out of puzzles! Come back after 00:00 UTC.";

export const DAILY_PUZZLE_LOAD_BLOCKED_MESSAGE =
  "This puzzle hasn’t been attempted yet, so it won’t load after today’s 200-puzzle limit. Previously attempted puzzles are still available. Come back after 00:00 UTC.";

export const utcDayBounds = (now = new Date()): { start: string; end: string } => {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
};

export const isTimestampInUtcDay = (value: string, now = new Date()): boolean => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  const { start, end } = utcDayBounds(now);
  return timestamp >= Date.parse(start) && timestamp < Date.parse(end);
};
