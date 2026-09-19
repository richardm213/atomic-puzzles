import { z } from "zod";

import { postApi } from "../api/postApi";

export type CustomPuzzleSet = {
  id: string;
  label: string;
  puzzleIds: number[];
  createdAt: string;
  updatedAt: string;
  tags: string[];
  untaggedOnly: boolean;
  authors: string[];
  resultFilter: "all" | "correct" | "incorrect";
  completedCount: number;
  correctCount: number;
  incorrectCount: number;
  nextPuzzleId: number | null;
};

export type CustomPuzzleSetAttempt = {
  puzzleId: string;
  attemptedAt: string;
  puzzleCorrect: boolean;
};

const customPuzzleSetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  puzzleIds: z.array(z.number().int().positive()),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(z.string()),
  untaggedOnly: z.boolean(),
  authors: z.array(z.string()),
  resultFilter: z.enum(["all", "correct", "incorrect"]),
  completedCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  incorrectCount: z.number().int().nonnegative(),
  nextPuzzleId: z.number().int().positive().nullable(),
});

const setResponseSchema = z.object({ set: customPuzzleSetSchema });
const setsResponseSchema = z.object({ sets: z.array(customPuzzleSetSchema) });
const successResponseSchema = z.object({ success: z.literal(true) });
const attemptsResponseSchema = z.object({
  attempts: z.array(
    z.object({
      puzzleId: z.string(),
      attemptedAt: z.string(),
      puzzleCorrect: z.boolean(),
    }),
  ),
});

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

export const fetchCustomPuzzleSetAttempts = async (
  id: string,
): Promise<CustomPuzzleSetAttempt[]> => {
  const result = await postApi(
    "/api/puzzle-sets",
    { action: "attempts", id },
    {
      errorMessage: "Unable to load custom set attempts.",
      invalidMessage: "The server returned invalid custom set attempts.",
      schema: attemptsResponseSchema,
    },
  );
  return result.attempts;
};

export const createCustomPuzzleSet = async (input: {
  name: string;
  tags: string[];
  untaggedOnly: boolean;
  authors: string[];
  resultFilter: "all" | "correct" | "incorrect";
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
