import type { SupabaseClient } from "@supabase/supabase-js";

export class PuzzleTagRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async update(puzzleId: number, tags: string[]) {
    const { data, error } = await this.supabase
      .from("puzzles")
      .update({ tags })
      .eq("id", puzzleId)
      .select("id,tags")
      .single();
    if (error) throw new Error(`Unable to update puzzle motifs: ${error.message}`);
    return data;
  }
}
