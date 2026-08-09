const CUSTOM_PUZZLE_SET_STORAGE_PREFIX = "atomic-puzzles.custom-puzzle-set.";

export type CustomPuzzleSet = {
  id: string;
  label: string;
  puzzleIds: number[];
  createdAt: string;
};

const normalizePuzzleIds = (puzzleIds: Array<string | number>): number[] => {
  const seen = new Set<number>();

  return puzzleIds.flatMap((value) => {
    const puzzleId = Number.parseInt(String(value), 10);
    if (!Number.isFinite(puzzleId) || puzzleId <= 0 || seen.has(puzzleId)) return [];
    seen.add(puzzleId);
    return [puzzleId];
  });
};

const storageKey = (setId: string): string =>
  `${CUSTOM_PUZZLE_SET_STORAGE_PREFIX}${String(setId ?? "").trim()}`;

export const createCustomPuzzleSet = (
  puzzleIds: Array<string | number>,
  label = "Dashboard review",
): CustomPuzzleSet | null => {
  if (typeof window === "undefined") return null;

  const normalizedIds = normalizePuzzleIds(puzzleIds);
  if (normalizedIds.length === 0) return null;

  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const customSet: CustomPuzzleSet = {
    id,
    label: String(label).trim() || "Dashboard review",
    puzzleIds: normalizedIds,
    createdAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(storageKey(id), JSON.stringify(customSet));
    return customSet;
  } catch {
    return null;
  }
};

export const readCustomPuzzleSet = (setId: string): CustomPuzzleSet | null => {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(storageKey(setId));
    if (!rawValue) return null;

    const parsedValue: unknown = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object") return null;

    const record = parsedValue as Partial<CustomPuzzleSet>;
    const puzzleIds = normalizePuzzleIds(Array.isArray(record.puzzleIds) ? record.puzzleIds : []);
    if (puzzleIds.length === 0) return null;

    return {
      id: String(record.id ?? setId).trim() || setId,
      label: String(record.label ?? "Dashboard review").trim() || "Dashboard review",
      puzzleIds,
      createdAt: String(record.createdAt ?? ""),
    };
  } catch {
    return null;
  }
};

export const getOrderedPuzzleIndexesForCustomSet = <T extends { puzzleId: number }>(
  puzzles: T[],
  customSet: CustomPuzzleSet | null,
): number[] => {
  if (!customSet) return [];

  const indexesByPuzzleId = new Map(
    puzzles.map((puzzle, index) => [Number(puzzle.puzzleId), index] as const),
  );

  return customSet.puzzleIds.flatMap((puzzleId) => {
    const index = indexesByPuzzleId.get(puzzleId);
    return index === undefined ? [] : [index];
  });
};
