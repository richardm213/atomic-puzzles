const RECENT_USERNAME_STORAGE_KEY = "atomic-puzzles.analysis.recent-usernames";
export const MAX_RECENT_USERNAMES = 18;

export const normalizeRecentUsernames = (usernames: unknown): string[] => {
  if (!Array.isArray(usernames)) return [];

  const seenUsernames = new Set<string>();
  return usernames
    .map((username) => String(username).trim())
    .filter((username) => {
      if (!username) return false;

      const normalizedUsername = username.toLowerCase();
      if (seenUsernames.has(normalizedUsername)) return false;

      seenUsernames.add(normalizedUsername);
      return true;
    })
    .slice(0, MAX_RECENT_USERNAMES);
};

export const loadRecentUsernames = (): string[] => {
  if (typeof window === "undefined") return [];

  try {
    return normalizeRecentUsernames(
      JSON.parse(window.localStorage.getItem(RECENT_USERNAME_STORAGE_KEY) ?? "[]"),
    );
  } catch {
    return [];
  }
};

export const storeRecentUsernames = (usernames: string[]): void => {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    RECENT_USERNAME_STORAGE_KEY,
    JSON.stringify(normalizeRecentUsernames(usernames)),
  );
};

export const addRecentUsername = (usernames: string[], username: string): string[] => {
  const trimmedUsername = username.trim();
  if (!trimmedUsername) return normalizeRecentUsernames(usernames);

  return normalizeRecentUsernames([
    trimmedUsername,
    ...usernames.filter(
      (recentUsername) => recentUsername.toLowerCase() !== trimmedUsername.toLowerCase(),
    ),
  ]);
};

export const removeRecentUsername = (usernames: string[], usernameToRemove: string): string[] =>
  normalizeRecentUsernames(
    usernames.filter(
      (recentUsername) => recentUsername.toLowerCase() !== usernameToRemove.toLowerCase(),
    ),
  );
