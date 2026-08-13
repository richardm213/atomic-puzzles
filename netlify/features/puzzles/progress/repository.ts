import type { SupabaseClient } from "@supabase/supabase-js";

export type PuzzleAttempt = {
  puzzleId: string;
  puzzleCorrect: boolean;
  incorrectMove: string | null;
  correctMove: string | null;
};

export class PuzzleProgressRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async record(username: string, attempt: PuzzleAttempt): Promise<void> {
    const { error } = await this.supabase.rpc("record_first_puzzle_attempt_v2", {
      p_username: username,
      p_puzzle_id: attempt.puzzleId,
      p_puzzle_correct: attempt.puzzleCorrect,
      p_incorrect_move: attempt.puzzleCorrect ? null : attempt.incorrectMove,
      p_correct_move: attempt.puzzleCorrect ? attempt.correctMove : null,
    });
    if (error) throw new Error(`Unable to record puzzle progress: ${error.message}`);
  }
}
