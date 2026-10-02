import { z } from "zod";

const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1).max(80);
const tagSchema = z.string().trim().min(1).max(80);
const puzzleIdSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .pipe(z.string().regex(/^\d{1,20}$/));

export const customPuzzleSetBodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("get"), id: idSchema }),
  z.object({ action: z.literal("attempts"), id: idSchema }),
  z.object({
    action: z.literal("create"),
    name: nameSchema,
    tags: z.array(tagSchema).max(20).default([]),
    untaggedOnly: z.boolean().default(false),
    authors: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
    resultFilter: z.enum(["all", "correct", "incorrect"]).default("all"),
  }),
  z.object({ action: z.literal("rename"), id: idSchema, name: nameSchema }),
  z.object({ action: z.literal("refresh"), id: idSchema }),
  z.object({ action: z.literal("remove-item"), id: idSchema, puzzleId: puzzleIdSchema }),
  z.object({ action: z.literal("reset"), id: idSchema }),
  z.object({ action: z.literal("delete"), id: idSchema }),
  z.object({
    action: z.literal("record"),
    id: idSchema,
    puzzleId: puzzleIdSchema,
    moves: z.array(z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/i)).min(1).max(100),
  }),
]);

export type CustomPuzzleSetAction = z.output<typeof customPuzzleSetBodySchema>;

export type CustomPuzzleSetRow = {
  id: string;
  name: string;
  tag_filters: string[] | null;
  author_filter: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomPuzzleSetItemRow = {
  set_id: string;
  puzzle_id: string;
  position: number;
  completed_at: string | null;
  last_result: boolean | null;
  attempt_count: number | null;
  removed_at: string | null;
};

export type PuzzleProgressRow = {
  puzzle_id: string;
  puzzle_correct: boolean;
};

export type PuzzleFilterRow = {
  id: number | string;
  author: string | null;
  tags: string[] | null;
};

export type PuzzleSolutionRow = { fen: string; solution: string };

export type CustomPuzzleSetFilters = {
  tags: string[];
  untaggedOnly: boolean;
  authors: string[];
  resultFilter: "all" | "correct" | "incorrect";
};

export const CUSTOM_PUZZLE_SET_SELECT = "id,name,tag_filters,author_filter,created_at,updated_at";

const FILTER_META_PREFIX = "__custom_set_filter__:";
const AUTHOR_META_PREFIX = `${FILTER_META_PREFIX}author:`;
const RESULT_META_PREFIX = `${FILTER_META_PREFIX}result:`;
const UNTAGGED_META = `${FILTER_META_PREFIX}untagged`;

export const encodeCustomPuzzleSetFilters = ({
  tags,
  authors,
  untaggedOnly,
  resultFilter,
}: CustomPuzzleSetFilters): string[] => [
  ...tags,
  ...(untaggedOnly ? [UNTAGGED_META] : []),
  ...(resultFilter === "all" ? [] : [`${RESULT_META_PREFIX}${resultFilter}`]),
  ...authors.map((author) => `${AUTHOR_META_PREFIX}${encodeURIComponent(author)}`),
];

export const decodeCustomPuzzleSetFilters = (set: CustomPuzzleSetRow): CustomPuzzleSetFilters => {
  const storedFilters = set.tag_filters ?? [];
  const encodedAuthors = storedFilters
    .filter((value) => value.startsWith(AUTHOR_META_PREFIX))
    .map((value) => {
      try {
        return decodeURIComponent(value.slice(AUTHOR_META_PREFIX.length));
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  const encodedResult = storedFilters
    .find((value) => value.startsWith(RESULT_META_PREFIX))
    ?.slice(RESULT_META_PREFIX.length);
  const resultFilter =
    encodedResult === "correct" || encodedResult === "incorrect" ? encodedResult : "all";

  return {
    tags: storedFilters.filter((value) => !value.startsWith(FILTER_META_PREFIX)),
    untaggedOnly: storedFilters.includes(UNTAGGED_META),
    authors: encodedAuthors.length ? encodedAuthors : set.author_filter ? [set.author_filter] : [],
    resultFilter,
  };
};

export const serializeCustomPuzzleSet = (
  set: CustomPuzzleSetRow,
  items: CustomPuzzleSetItemRow[],
) => {
  const orderedItems = items
    .filter((item) => item.set_id === set.id && !item.removed_at)
    .sort((left, right) => left.position - right.position);
  const completed = orderedItems.filter((item) => item.completed_at);

  return {
    id: set.id,
    label: set.name,
    puzzleIds: orderedItems.map((item) => Number(item.puzzle_id)).filter(Number.isSafeInteger),
    createdAt: set.created_at,
    updatedAt: set.updated_at,
    ...decodeCustomPuzzleSetFilters(set),
    completedCount: completed.length,
    correctCount: completed.filter((item) => item.last_result === true).length,
    incorrectCount: completed.filter((item) => item.last_result === false).length,
    nextPuzzleId:
      Number(
        (orderedItems.find((item) => !item.completed_at) ?? orderedItems[0])?.puzzle_id ??
          Number.NaN,
      ) || null,
  };
};

export const createPendingItem = (
  setId: string,
  puzzleId: string,
  position: number,
): CustomPuzzleSetItemRow => ({
  set_id: setId,
  puzzle_id: puzzleId,
  position,
  completed_at: null,
  last_result: null,
  attempt_count: 0,
  removed_at: null,
});
