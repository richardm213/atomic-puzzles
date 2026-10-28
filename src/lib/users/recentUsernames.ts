import { getBrowserStorageJson, setBrowserStorageJson } from "../../utils/browserStorage";

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
  const stored = getBrowserStorageJson<unknown>("local", RECENT_USERNAME_STORAGE_KEY, []);
  return normalizeRecentUsernames(stored);
};

export const storeRecentUsernames = (usernames: string[]): void => {
  setBrowserStorageJson("local", RECENT_USERNAME_STORAGE_KEY, normalizeRecentUsernames(usernames));
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
