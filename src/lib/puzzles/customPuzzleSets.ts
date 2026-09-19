import { z } from "zod";

import { postApi } from "../api/postApi";

const CUSTOM_PUZZLE_SET_STORAGE_PREFIX = "atomic-puzzles.custom-puzzle-set.";

export type CustomPuzzleSet = {
  id: string;
  label: string;
  puzzleIds: number[];
  createdAt: string;
  updatedAt: string;
  tags: string[];
  author: string;
  completedCount: number;
  correctCount: number;
  incorrectCount: number;
  nextPuzzleId: number | null;
};

const customPuzzleSetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  puzzleIds: z.array(z.number().int().positive()),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
  author: z.string(),
  completedCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  incorrectCount: z.number().int().nonnegative(),
  nextPuzzleId: z.number().int().positive().nullable(),
});

const setResponseSchema = z.object({ set: customPuzzleSetSchema });
const setsResponseSchema = z.object({ sets: z.array(customPuzzleSetSchema) });
const successResponseSchema = z.object({ success: z.literal(true) });

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

/** Reads pre-Supabase dashboard sets so existing links keep working. */
export const readLegacyCustomPuzzleSet = (setId: string): CustomPuzzleSet | null => {
  if (typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(storageKey(setId));
    if (!rawValue) return null;
    const parsedValue: unknown = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object") return null;
    const record = parsedValue as { label?: unknown; puzzleIds?: unknown; createdAt?: unknown };
    const puzzleIds = normalizePuzzleIds(Array.isArray(record.puzzleIds) ? record.puzzleIds : []);
    if (puzzleIds.length === 0) return null;
    const createdAt = String(record.createdAt ?? "");
    return {
      id: setId,
      label: String(record.label ?? "Dashboard review").trim() || "Dashboard review",
      puzzleIds,
      createdAt,
      updatedAt: createdAt,
      tags: [],
      author: "",
      completedCount: 0,
      correctCount: 0,
      incorrectCount: 0,
      nextPuzzleId: puzzleIds[0] ?? null,
    };
  } catch {
    return null;
  }
};

export const listCustomPuzzleSets = async (): Promise<CustomPuzzleSet[]> => {
  const result = await postApi(
    "/api/puzzle-sets",
    { action: "list" },
    {
      errorMessage: "Unable to load custom puzzle sets.",
      invalidMessage: "The server returned invalid custom puzzle sets.",
      schema: setsResponseSchema,
    },
  );
  return result.sets;
};

export const fetchCustomPuzzleSet = async (id: string): Promise<CustomPuzzleSet> => {
  const result = await postApi(
    "/api/puzzle-sets",
    { action: "get", id },
    {
      errorMessage: "Unable to load this custom puzzle set.",
      invalidMessage: "The server returned an invalid custom puzzle set.",
      schema: setResponseSchema,
    },
  );
  return result.set;
};

export const createCustomPuzzleSet = async (input: {
  name: string;
  tags: string[];
  author: string;
}): Promise<CustomPuzzleSet> => {
  const result = await postApi(
    "/api/puzzle-sets",
    { action: "create", ...input },
    {
      errorMessage: "Unable to create the custom puzzle set.",
      invalidMessage: "The server returned an invalid custom puzzle set.",
      schema: setResponseSchema,
    },
  );
  return result.set;
};

export const renameCustomPuzzleSet = async (id: string, name: string): Promise<CustomPuzzleSet> => {
  const result = await postApi(
    "/api/puzzle-sets",
    { action: "rename", id, name },
    { errorMessage: "Unable to rename the custom puzzle set.", schema: setResponseSchema },
  );
  return result.set;
};

export const resetCustomPuzzleSetProgress = async (id: string): Promise<void> => {
  await postApi(
    "/api/puzzle-sets",
    { action: "reset", id },
    { errorMessage: "Unable to reset set progress.", schema: successResponseSchema },
  );
};

export const deleteCustomPuzzleSet = async (id: string): Promise<void> => {
  await postApi(
    "/api/puzzle-sets",
    { action: "delete", id },
    { errorMessage: "Unable to delete the custom puzzle set.", schema: successResponseSchema },
  );
};

export const recordCustomPuzzleSetProgress = async (
  id: string,
  puzzleId: string | number,
  puzzleCorrect: boolean,
): Promise<void> => {
  await postApi(
    "/api/puzzle-sets",
    { action: "record", id, puzzleId, puzzleCorrect },
    { errorMessage: "Unable to record custom set progress.", schema: successResponseSchema },
  );
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
