export const MAX_CACHE_ENTRIES = 500;
// The source database is rebuilt as a batch, not updated game by game. Keeping
// hot filtered positions for five minutes prevents repeat Turso cold reads while
// still bounding staleness after a database refresh.
export const EXPLORER_CACHE_TTL_MS = 5 * 60_000;
