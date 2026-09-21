import { z } from "zod";

import {
  authenticateRequest,
  identityResponse,
  requireSameOrigin,
  requireUsername,
} from "../../../platform/authentication";
import type { FunctionEvent } from "../../../platform/defineFunction";
import { createServerSupabase } from "../../../platform/environment";
import { HttpError } from "../../../platform/errors";
import { parseJsonBody } from "../../../platform/validation";

const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1).max(80);
const tagSchema = z.string().trim().min(1).max(80);
const bodySchema = z.discriminatedUnion("action", [
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
  z.object({ action: z.literal("reset"), id: idSchema }),
  z.object({ action: z.literal("delete"), id: idSchema }),
  z.object({
    action: z.literal("record"),
    id: idSchema,
    puzzleId: z
      .union([z.string(), z.number()])
      .transform(String)
      .pipe(z.string().regex(/^\d{1,20}$/)),
    puzzleCorrect: z.boolean(),
  }),
]);

type SetRow = {
  id: string;
  name: string;
  tag_filters: string[] | null;
  author_filter: string | null;
  created_at: string;
  updated_at: string;
};

const FILTER_META_PREFIX = "__custom_set_filter__:";
const authorMetaPrefix = `${FILTER_META_PREFIX}author:`;
const resultMetaPrefix = `${FILTER_META_PREFIX}result:`;
const untaggedMeta = `${FILTER_META_PREFIX}untagged`;
const baseSetSelect = "id,name,tag_filters,author_filter,created_at,updated_at";

const encodeFilterMetadata = (
  tags: string[],
  authors: string[],
  untaggedOnly: boolean,
  resultFilter: "all" | "correct" | "incorrect",
): string[] => [
  ...tags,
  ...(untaggedOnly ? [untaggedMeta] : []),
  ...(resultFilter === "all" ? [] : [`${resultMetaPrefix}${resultFilter}`]),
  ...authors.map((author) => `${authorMetaPrefix}${encodeURIComponent(author)}`),
];

const decodeFilterMetadata = (set: SetRow) => {
  const storedFilters = set.tag_filters ?? [];
  const encodedAuthors = storedFilters
    .filter((value) => value.startsWith(authorMetaPrefix))
    .map((value) => {
      try {
        return decodeURIComponent(value.slice(authorMetaPrefix.length));
      } catch {
        return "";
      }
    })
    .filter(Boolean);
  const encodedResult = storedFilters
    .find((value) => value.startsWith(resultMetaPrefix))
    ?.slice(resultMetaPrefix.length);
  const resultFilter =
    encodedResult === "correct" || encodedResult === "incorrect" ? encodedResult : "all";

  return {
    tags: storedFilters.filter((value) => !value.startsWith(FILTER_META_PREFIX)),
    untaggedOnly: storedFilters.includes(untaggedMeta),
    authors: encodedAuthors.length ? encodedAuthors : set.author_filter ? [set.author_filter] : [],
    resultFilter,
  };
};

type ItemRow = {
  set_id: string;
  puzzle_id: string;
  position: number;
  completed_at: string | null;
  last_result: boolean | null;
  attempt_count: number | null;
};

const loadAll = async <T>(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> => {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = Array.isArray(data) ? (data as T[]) : [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};

const serializeSet = (set: SetRow, items: ItemRow[]) => {
  const orderedItems = items
    .filter((item) => item.set_id === set.id)
    .sort((left, right) => left.position - right.position);
  const completed = orderedItems.filter((item) => item.completed_at);
  const filters = decodeFilterMetadata(set);
  return {
    id: set.id,
    label: set.name,
    puzzleIds: orderedItems.map((item) => Number(item.puzzle_id)).filter(Number.isSafeInteger),
    createdAt: set.created_at,
    updatedAt: set.updated_at,
    ...filters,
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

export const puzzleSetsRoute = async (event: FunctionEvent) => {
  const input = parseJsonBody(event, bodySchema, "Invalid custom puzzle set request.");
  if (input.action !== "list" && input.action !== "get" && input.action !== "attempts") {
    requireSameOrigin(event.headers, "Cross-site custom-set requests are not allowed.");
  }
  const identity = await authenticateRequest(event.headers);
  const username = requireUsername(identity, "Log in with Lichess to use custom puzzle sets.");
  const supabase = createServerSupabase("Custom puzzle sets");

  const loadOwnedSet = async (id: string): Promise<SetRow> => {
    const result = await supabase
      .from("custom_puzzle_sets")
      .select(baseSetSelect)
      .eq("id", id)
      .eq("username", username)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new HttpError(404, "Custom puzzle set not found.");
    return result.data;
  };

  const loadItems = async (setIds: string[]): Promise<ItemRow[]> => {
    if (!setIds.length) return [];
    return loadAll<ItemRow>((from, to) =>
      supabase
        .from("custom_puzzle_set_items")
        .select("set_id,puzzle_id,position,completed_at,last_result,attempt_count")
        .in("set_id", setIds)
        .order("position", { ascending: true })
        .range(from, to),
    );
  };

  if (input.action === "list") {
    const result = await supabase
      .from("custom_puzzle_sets")
      .select(baseSetSelect)
      .eq("username", username)
      .order("updated_at", { ascending: false });
    if (result.error) throw new Error(result.error.message);
    const sets = (result.data ?? []) as SetRow[];
    const items = await loadItems(sets.map((set) => set.id));
    return identityResponse(identity, 200, { sets: sets.map((set) => serializeSet(set, items)) });
  }

  if (input.action === "get") {
    const set = await loadOwnedSet(input.id);
    return identityResponse(identity, 200, { set: serializeSet(set, await loadItems([set.id])) });
  }

  if (input.action === "attempts") {
    const set = await loadOwnedSet(input.id);
    const items = await loadItems([set.id]);
    return identityResponse(identity, 200, {
      attempts: items
        .filter((item) => item.completed_at && item.last_result !== null)
        .map((item) => ({
          puzzleId: item.puzzle_id,
          attemptedAt: String(item.completed_at),
          puzzleCorrect: Boolean(item.last_result),
        }))
        .sort((left, right) => right.attemptedAt.localeCompare(left.attemptedAt)),
    });
  }

  if (input.action === "create") {
    const progressRows = await loadAll<{ puzzle_id: string; puzzle_correct: boolean }>((from, to) =>
      supabase
        .from("puzzle_progress")
        .select("puzzle_id,puzzle_correct")
        .eq("username", username)
        .order("first_attempt_at", { ascending: true })
        .range(from, to),
    );
    const attemptedIds = [...new Set(progressRows.map((row) => String(row.puzzle_id)))];
    const resultByPuzzleId = new Map(
      progressRows.map((row) => [String(row.puzzle_id), Boolean(row.puzzle_correct)]),
    );
    if (!attemptedIds.length) {
      throw new HttpError(400, "Complete at least one puzzle before creating a custom set.");
    }

    const puzzles: Array<{ id: number | string; author: string | null; tags: string[] | null }> =
      [];
    for (let index = 0; index < attemptedIds.length; index += 500) {
      const result = await supabase
        .from("puzzles")
        .select("id,author,tags")
        .in("id", attemptedIds.slice(index, index + 500));
      if (result.error) throw new Error(result.error.message);
      puzzles.push(...((result.data ?? []) as typeof puzzles));
    }

    const normalizedAuthors = new Set(input.authors.map((author) => author.toLocaleLowerCase()));
    const selectedTags = [...new Set(input.tags)];
    const matchingPuzzleIds = puzzles
      .filter((puzzle) => {
        const wasCorrect = resultByPuzzleId.get(String(puzzle.id));
        if (input.resultFilter === "correct" && wasCorrect !== true) return false;
        if (input.resultFilter === "incorrect" && wasCorrect !== false) return false;
        if (
          normalizedAuthors.size > 0 &&
          !normalizedAuthors.has(
            String(puzzle.author ?? "")
              .trim()
              .toLocaleLowerCase(),
          )
        )
          return false;
        const tags = new Set(Array.isArray(puzzle.tags) ? puzzle.tags : []);
        if (input.untaggedOnly) return tags.size === 0;
        return selectedTags.every((tag) => tags.has(tag));
      })
      .map((puzzle) => String(puzzle.id));
    if (!matchingPuzzleIds.length) {
      throw new HttpError(400, "No completed puzzles match those filters.");
    }

    const insertResult = await supabase
      .from("custom_puzzle_sets")
      .insert({
        username,
        name: input.name,
        tag_filters: encodeFilterMetadata(
          selectedTags,
          [...new Set(input.authors)],
          input.untaggedOnly,
          input.resultFilter,
        ),
        author_filter: input.authors.length === 1 ? input.authors[0] : null,
      })
      .select(baseSetSelect)
      .single();
    if (insertResult.error) {
      if (insertResult.error.code === "23505")
        throw new HttpError(409, "You already have a set with that name.");
      throw new Error(insertResult.error.message);
    }
    const set = insertResult.data;
    const items = matchingPuzzleIds.map((puzzleId, position) => ({
      set_id: set.id,
      puzzle_id: puzzleId,
      position,
    }));
    const itemsResult = await supabase.from("custom_puzzle_set_items").insert(items);
    if (itemsResult.error) {
      await supabase.from("custom_puzzle_sets").delete().eq("id", set.id).eq("username", username);
      throw new Error(itemsResult.error.message);
    }
    return identityResponse(identity, 201, {
      set: serializeSet(
        set,
        items.map((item) => ({ ...item, completed_at: null, last_result: null, attempt_count: 0 })),
      ),
    });
  }

  const set = await loadOwnedSet(input.id);
  if (input.action === "rename") {
    const result = await supabase
      .from("custom_puzzle_sets")
      .update({ name: input.name, updated_at: new Date().toISOString() })
      .eq("id", set.id)
      .eq("username", username)
      .select(baseSetSelect)
      .single();
    if (result.error) {
      if (result.error.code === "23505")
        throw new HttpError(409, "You already have a set with that name.");
      throw new Error(result.error.message);
    }
    return identityResponse(identity, 200, {
      set: serializeSet(result.data, await loadItems([set.id])),
    });
  }

  if (input.action === "reset") {
    const result = await supabase
      .from("custom_puzzle_set_items")
      .update({ completed_at: null, last_result: null, attempt_count: 0 })
      .eq("set_id", set.id);
    if (result.error) throw new Error(result.error.message);
    return identityResponse(identity, 200, { success: true });
  }

  if (input.action === "delete") {
    const result = await supabase
      .from("custom_puzzle_sets")
      .delete()
      .eq("id", set.id)
      .eq("username", username);
    if (result.error) throw new Error(result.error.message);
    return identityResponse(identity, 200, { success: true });
  }

  const currentItems = await loadItems([set.id]);
  const item = currentItems.find((candidate) => candidate.puzzle_id === input.puzzleId);
  if (!item) throw new HttpError(400, "That puzzle is not part of this custom set.");
  if (item.completed_at) {
    return identityResponse(identity, 200, { success: true });
  }
  const result = await supabase
    .from("custom_puzzle_set_items")
    .update({
      completed_at: new Date().toISOString(),
      last_result: input.puzzleCorrect,
      attempt_count: 1,
    })
    .eq("set_id", set.id)
    .eq("puzzle_id", input.puzzleId)
    .is("completed_at", null);
  if (result.error) throw new Error(result.error.message);
  return identityResponse(identity, 200, { success: true });
};
