import type { SupabaseClient } from "@supabase/supabase-js";

import { HttpError } from "../../../platform/errors";
import {
  CUSTOM_PUZZLE_SET_SELECT,
  type CustomPuzzleSetFilters,
  type CustomPuzzleSetItemRow,
  type CustomPuzzleSetRow,
  encodeCustomPuzzleSetFilters,
  type PuzzleFilterRow,
  type PuzzleProgressRow,
} from "./model";

const loadAll = async <T>(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> => {
  const rows: T[] = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = Array.isArray(data) ? (data as T[]) : [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
};

export class CustomPuzzleSetRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly username: string,
  ) {}

  async listSets(): Promise<CustomPuzzleSetRow[]> {
    const result = await this.supabase
      .from("custom_puzzle_sets")
      .select(CUSTOM_PUZZLE_SET_SELECT)
      .eq("username", this.username)
      .order("updated_at", { ascending: false });
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []);
  }

  async loadOwnedSet(id: string): Promise<CustomPuzzleSetRow> {
    const result = await this.supabase
      .from("custom_puzzle_sets")
      .select(CUSTOM_PUZZLE_SET_SELECT)
      .eq("id", id)
      .eq("username", this.username)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new HttpError(404, "Custom puzzle set not found.");
    return result.data;
  }

  async loadItems(setIds: string[]): Promise<CustomPuzzleSetItemRow[]> {
    if (!setIds.length) return [];
    return loadAll<CustomPuzzleSetItemRow>((from, to) =>
      this.supabase
        .from("custom_puzzle_set_items")
        .select("set_id,puzzle_id,position,completed_at,last_result,attempt_count,removed_at")
        .in("set_id", setIds)
        .order("position", { ascending: true })
        .range(from, to),
    );
  }

  async loadProgress(): Promise<PuzzleProgressRow[]> {
    return loadAll<PuzzleProgressRow>((from, to) =>
      this.supabase
        .from("puzzle_progress")
        .select("puzzle_id,puzzle_correct")
        .eq("username", this.username)
        .order("first_attempt_at", { ascending: true })
        .range(from, to),
    );
  }

  async loadAllPuzzles(): Promise<PuzzleFilterRow[]> {
    return loadAll<PuzzleFilterRow>((from, to) =>
      this.supabase
        .from("puzzles")
        .select("id,author,tags")
        .order("id", { ascending: true })
        .range(from, to),
    );
  }

  async loadPuzzlesByIds(puzzleIds: string[]): Promise<PuzzleFilterRow[]> {
    const puzzles: PuzzleFilterRow[] = [];
    for (let index = 0; index < puzzleIds.length; index += 500) {
      const result = await this.supabase
        .from("puzzles")
        .select("id,author,tags")
        .in("id", puzzleIds.slice(index, index + 500));
      if (result.error) throw new Error(result.error.message);
      puzzles.push(...((result.data ?? []) as PuzzleFilterRow[]));
    }
    return puzzles;
  }

  async createSet(name: string, filters: CustomPuzzleSetFilters): Promise<CustomPuzzleSetRow> {
    const result = await this.supabase
      .from("custom_puzzle_sets")
      .insert({
        username: this.username,
        name,
        tag_filters: encodeCustomPuzzleSetFilters(filters),
        author_filter: filters.authors.length === 1 ? filters.authors[0] : null,
      })
      .select(CUSTOM_PUZZLE_SET_SELECT)
      .single();
    if (result.error) {
      if (result.error.code === "23505") {
        throw new HttpError(409, "You already have a set with that name.");
      }
      throw new Error(result.error.message);
    }
    return result.data;
  }

  async insertItems(items: Array<{ set_id: string; puzzle_id: string; position: number }>) {
    if (!items.length) return;
    const result = await this.supabase.from("custom_puzzle_set_items").insert(items);
    if (result.error) throw new Error(result.error.message);
  }

  async restoreItem(setId: string, puzzleId: string): Promise<void> {
    const result = await this.supabase
      .from("custom_puzzle_set_items")
      .update({ removed_at: null })
      .eq("set_id", setId)
      .eq("puzzle_id", puzzleId);
    if (result.error) throw new Error(result.error.message);
  }

  async touchSet(id: string, updatedAt: string): Promise<CustomPuzzleSetRow> {
    const result = await this.supabase
      .from("custom_puzzle_sets")
      .update({ updated_at: updatedAt })
      .eq("id", id)
      .eq("username", this.username)
      .select(CUSTOM_PUZZLE_SET_SELECT)
      .single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async removeItem(setId: string, puzzleId: string, removedAt: string): Promise<void> {
    const result = await this.supabase
      .from("custom_puzzle_set_items")
      .update({ removed_at: removedAt })
      .eq("set_id", setId)
      .eq("puzzle_id", puzzleId)
      .is("removed_at", null);
    if (result.error) throw new Error(result.error.message);
  }

  async renameSet(id: string, name: string, updatedAt: string): Promise<CustomPuzzleSetRow> {
    const result = await this.supabase
      .from("custom_puzzle_sets")
      .update({ name, updated_at: updatedAt })
      .eq("id", id)
      .eq("username", this.username)
      .select(CUSTOM_PUZZLE_SET_SELECT)
      .single();
    if (result.error) {
      if (result.error.code === "23505") {
        throw new HttpError(409, "You already have a set with that name.");
      }
      throw new Error(result.error.message);
    }
    return result.data;
  }

  async resetSet(id: string): Promise<void> {
    const result = await this.supabase
      .from("custom_puzzle_set_items")
      .update({ completed_at: null, last_result: null, attempt_count: 0 })
      .eq("set_id", id);
    if (result.error) throw new Error(result.error.message);
  }

  async deleteSet(id: string): Promise<void> {
    const result = await this.supabase
      .from("custom_puzzle_sets")
      .delete()
      .eq("id", id)
      .eq("username", this.username);
    if (result.error) throw new Error(result.error.message);
  }

  async recordItem(setId: string, puzzleId: string, puzzleCorrect: boolean): Promise<void> {
    const result = await this.supabase
      .from("custom_puzzle_set_items")
      .update({
        completed_at: new Date().toISOString(),
        last_result: puzzleCorrect,
        attempt_count: 1,
      })
      .eq("set_id", setId)
      .eq("puzzle_id", puzzleId)
      .is("completed_at", null);
    if (result.error) throw new Error(result.error.message);
  }
}
