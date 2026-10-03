export type PuzzleUnratedReason = "creator-window" | "existing-unrated";

const normalizedUsername = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

const oneCalendarMonthAfter = (date: Date): Date => {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const daysInTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return result;
};

export const getPuzzleUnratedReason = ({
  username,
  author,
  createdAt,
  hasUnratedAttempt,
  now = new Date(),
}: {
  username: unknown;
  author: unknown;
  createdAt: unknown;
  hasUnratedAttempt: boolean;
  now?: Date;
}): PuzzleUnratedReason | null => {
  const solver = normalizedUsername(username);
  if (!solver) return null;
  if (hasUnratedAttempt) return "existing-unrated";
  if (solver !== normalizedUsername(author)) return null;

  const created = new Date(String(createdAt ?? ""));
  if (Number.isNaN(created.getTime())) return null;

  return now >= created && now < oneCalendarMonthAfter(created) ? "creator-window" : null;
};
