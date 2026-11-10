export type PuzzleUnratedReason = "creator-window" | "existing-unrated" | "rating-exclusion";

const normalizedUsername = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export const getPuzzleUnratedReason = ({
  username,
  author,
  createdAt,
  hasUnratedAttempt,
  excludedUntil,
  now = new Date(),
}: {
  username: unknown;
  author: unknown;
  createdAt: unknown;
  hasUnratedAttempt: boolean;
  excludedUntil?: string | undefined;
  now?: Date;
}): PuzzleUnratedReason | null => {
  const solver = normalizedUsername(username);
  if (!solver) return null;
  if (excludedUntil && now < new Date(excludedUntil)) return "rating-exclusion";
  if (hasUnratedAttempt && !excludedUntil) return "existing-unrated";
  if (solver !== normalizedUsername(author)) return null;

  const created = new Date(String(createdAt ?? ""));
  if (Number.isNaN(created.getTime())) return null;

  const cooldownEnds = new Date(created.getTime() + 45 * 24 * 60 * 60 * 1000);
  return now >= created && now < cooldownEnds ? "creator-window" : null;
};
