const DASHBOARD_PUZZLE_SET_STORAGE_PREFIX = "atomic-puzzles.dashboard-puzzle-set.";

export type DashboardPuzzleSet = {
  id: string;
  label: string;
  puzzleIds: number[];
  sourceUsername: string;
  createdAt: string;
};

const normalizePuzzleIds = (puzzleIds: Array<string | number>): number[] => {
  const seen = new Set<number>();

  return puzzleIds.flatMap((value) => {
    const puzzleId = Number.parseInt(String(value), 10);
    if (!Number.isSafeInteger(puzzleId) || puzzleId <= 0 || seen.has(puzzleId)) return [];
    seen.add(puzzleId);
    return [puzzleId];
  });
};

const storageKey = (setId: string): string =>
  `${DASHBOARD_PUZZLE_SET_STORAGE_PREFIX}${String(setId ?? "").trim()}`;

export const createDashboardPuzzleSet = (
  puzzleIds: Array<string | number>,
  sourceUsername: string,
): DashboardPuzzleSet | null => {
  if (typeof window === "undefined") return null;

  const normalizedIds = normalizePuzzleIds(puzzleIds);
  if (normalizedIds.length === 0) return null;

  const normalizedUsername = String(sourceUsername ?? "").trim();
  const set: DashboardPuzzleSet = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: normalizedUsername ? `${normalizedUsername}'s puzzle history` : "Puzzle history",
    puzzleIds: normalizedIds,
    sourceUsername: normalizedUsername,
    createdAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(storageKey(set.id), JSON.stringify(set));
    return set;
  } catch {
    return null;
  }
};

export const readDashboardPuzzleSet = (setId: string): DashboardPuzzleSet | null => {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(storageKey(setId));
    if (!rawValue) return null;

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object") return null;

    const record = parsedValue as Partial<DashboardPuzzleSet>;
    const puzzleIds = normalizePuzzleIds(Array.isArray(record.puzzleIds) ? record.puzzleIds : []);
    if (puzzleIds.length === 0) return null;

    const sourceUsername = String(record.sourceUsername ?? "").trim();
    return {
      id: String(record.id ?? setId).trim() || setId,
      label:
        String(record.label ?? "").trim() ||
        (sourceUsername ? `${sourceUsername}'s puzzle history` : "Puzzle history"),
      puzzleIds,
      sourceUsername,
      createdAt: String(record.createdAt ?? ""),
    };
  } catch {
    return null;
  }
};

export const getOrderedPuzzleIndexesForDashboardSet = <T extends { puzzleId: number }>(
  puzzles: T[],
  set: DashboardPuzzleSet | null,
): number[] => {
  if (!set) return [];

  const indexesByPuzzleId = new Map(
    puzzles.map((puzzle, index) => [Number(puzzle.puzzleId), index] as const),
  );

  return set.puzzleIds.flatMap((puzzleId) => {
    const index = indexesByPuzzleId.get(puzzleId);
    return index === undefined ? [] : [index];
  });
};
