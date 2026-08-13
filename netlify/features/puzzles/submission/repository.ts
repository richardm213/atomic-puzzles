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
}
