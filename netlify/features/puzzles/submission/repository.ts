import type { SupabaseClient } from "@supabase/supabase-js";

import { HttpError } from "../../../platform/errors";

export type QueuedPuzzleSubmission = {
  fen: string;
  solution: string;
  event: string;
  explanation: string;
};

export class PuzzleSubmissionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async enqueue(username: string, puzzle: QueuedPuzzleSubmission) {
    const { error: userError } = await this.supabase
      .from("users")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
    if (userError) throw new Error(`Unable to verify account: ${userError.message}`);

    const { data, error } = await this.supabase
      .rpc("enqueue_puzzle_submission", {
        p_fen: puzzle.fen,
        p_solution: puzzle.solution,
        p_event: puzzle.event,
        p_explanation: puzzle.explanation,
        p_submitted_by: username,
      })
      .single();
    if (error?.message.includes("Puzzle moves already exist for FEN in queue")) {
      throw new HttpError(
        409,
        "A puzzle with this FEN and the same moves is already pending review.",
      );
    }
    if (error?.message.includes("Puzzle moves already exist for FEN")) {
      throw new HttpError(409, "A puzzle with this FEN and the same moves already exists.");
    }
    if (error) throw new Error(`Unable to submit puzzle: ${error.message}`);
    return data;
  }

  async publishBatch(username: string, puzzles: QueuedPuzzleSubmission[]): Promise<number[]> {
    const { error: userError } = await this.supabase
      .from("users")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
    if (userError) throw new Error(`Unable to verify account: ${userError.message}`);

    const { data, error } = await this.supabase.rpc("publish_approved_puzzle_batch", {
      p_puzzles: puzzles,
      p_submitted_by: username,
    });
    if (error?.message.includes("Puzzle moves already exist for FEN in queue")) {
      throw new HttpError(
        409,
        "A puzzle with this FEN and the same moves is already pending review.",
      );
    }
    if (error?.message.includes("Puzzle moves already exist for FEN")) {
      throw new HttpError(409, "A puzzle with this FEN and the same moves already exists.");
    }
    if (/only approved puzzle creators/i.test(error?.message ?? "")) {
      throw new HttpError(403, "This account is not approved to publish puzzles directly.");
    }
    if (error) throw new Error(`Unable to create puzzle: ${error.message}`);

    if (!Array.isArray(data)) {
      throw new Error("Unable to create puzzles: no puzzle ids were returned.");
    }
    const puzzleIds = data.map(Number);
    if (
      puzzleIds.length !== puzzles.length ||
      puzzleIds.some((puzzleId) => !Number.isSafeInteger(puzzleId) || puzzleId < 1)
    ) {
      throw new Error("Unable to create puzzles: invalid puzzle ids were returned.");
    }
    return puzzleIds;
  }
}
