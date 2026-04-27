export const normalizeUsername = (username: unknown): string =>
  String(username ?? "")
    .trim()
    .toLowerCase();
