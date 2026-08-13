export const MAX_CACHE_ENTRIES = 500;

export const shouldCacheExplorerResponse = ({
  moves,
  opponent,
  username,
}: {
  moves: Record<string, unknown>[];
  opponent: string;
  username: string;
}): boolean => {
  if (username || opponent) return false;
  return moves.reduce((total, row) => total + Number(row.games ?? 0), 0) >= 1_000;
};

export const rememberCacheEntry = (
  cache: Map<string, string>,
  key: string,
  value: string,
): void => {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, value);
};
