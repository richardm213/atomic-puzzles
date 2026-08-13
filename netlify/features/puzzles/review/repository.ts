import type { SupabaseClient } from "@supabase/supabase-js";

import type { PuzzleSubmissionValue } from "../../../../shared/domain/puzzles/puzzleSubmission";
import { HttpError } from "../../../platform/errors";

export type QueuedPuzzleUpdate = PuzzleSubmissionValue & { submitted_by: string };

export class PuzzleReviewRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listQueue() {
    const { data, error } = await this.supabase
      .from("puzzles_queue")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(`Unable to load puzzle queue: ${error.message}`);
    return data ?? [];
  }

  async nextPuzzleId(): Promise<number> {
    const { data, error } = await this.supabase
      .from("puzzles")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);
    if (error) throw new Error(`Unable to determine the next puzzle id: ${error.message}`);
    const highest = Number(data?.[0]?.id ?? 0);
    if (!Number.isSafeInteger(highest) || highest < 0) {
      throw new Error("Unable to determine the next puzzle id.");
    }
    return highest + 1;
  }

  async update(id: number, puzzle: QueuedPuzzleUpdate) {
    const { data, error } = await this.supabase
      .from("puzzles_queue")
      .update(puzzle)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(`Unable to save queued puzzle: ${error.message}`);
    if (!data) throw new Error("Unable to save queued puzzle: no queue row was returned.");
    return data;
  }

  async reject(id: number): Promise<void> {
    const { error } = await this.supabase.from("puzzles_queue").delete().eq("id", id);
    if (error) throw new Error(`Unable to reject queued puzzle: ${error.message}`);
  }

  async approve(id: number, reviewer: string, puzzleId: number): Promise<number> {
    const { data, error } = await this.supabase.rpc("approve_queued_puzzle", {
      p_queue_id: id,
      p_reviewer: reviewer,
      p_puzzle_id: puzzleId,
    });
    if (error) {
      if (/could not find the function.*approve_queued_puzzle/i.test(error.message)) {
        throw new HttpError(
          503,
          "Puzzle approval is not configured yet. Run the latest puzzles_queue.sql in Supabase.",
        );
      }
      if (/puzzle id .* already exists/i.test(error.message)) {
        throw new HttpError(409, error.message);
      }
      throw new Error(`Unable to approve puzzle: ${error.message}`);
    }
    const approvedPuzzleId = Number(data);
    if (!Number.isFinite(approvedPuzzleId)) {
      throw new Error("Unable to approve puzzle: no puzzle id was returned.");
    }
    return approvedPuzzleId;
  }
}
