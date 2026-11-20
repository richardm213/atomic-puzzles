export type PuzzleUnratedReason =
  "creator-window" | "existing-unrated" | "rating-exclusion" | "permanent";

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
  permanentlyUnrated = false,
  now = new Date(),
}: {
  username: unknown;
  author: unknown;
  createdAt: unknown;
  hasUnratedAttempt: boolean;
  excludedUntil?: string | undefined;
  permanentlyUnrated?: boolean;
  now?: Date;
}): PuzzleUnratedReason | null => {
  const solver = normalizedUsername(username);
  if (!solver) return null;
  if (permanentlyUnrated) return "permanent";
  // Stored exclusions govern existing puzzles, including windows set before the policy changed.
  if (excludedUntil) return now < new Date(excludedUntil) ? "rating-exclusion" : null;
  if (hasUnratedAttempt) return "existing-unrated";
  if (solver !== normalizedUsername(author)) return null;

  const created = new Date(String(createdAt ?? ""));
  if (Number.isNaN(created.getTime())) return null;

  const cooldownEnds = new Date(created);
  cooldownEnds.setUTCMonth(created.getUTCMonth() + 2, 1);
  const lastDay = new Date(cooldownEnds);
  lastDay.setUTCMonth(cooldownEnds.getUTCMonth() + 1, 0);
  cooldownEnds.setUTCDate(Math.min(created.getUTCDate(), lastDay.getUTCDate()));
  return now >= created && now < cooldownEnds ? "creator-window" : null;
};
