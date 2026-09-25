import type { SupabaseClient } from "@supabase/supabase-js";

import { DIFFERENT_START_MOVE_CONFIRMATION } from "../../../../shared/domain/puzzles/submissionDuplicates";
import { HttpError } from "../../../platform/errors";

export type QueuedPuzzleSubmission = {
  fen: string;
  solution: string;
  event: string;
  eventName: string;
  eventDate: string;
  players: string[];
  whitePlayer: string;
  blackPlayer: string;
  explanation: string;
};

export class PuzzleSubmissionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async enqueue(username: string, puzzle: QueuedPuzzleSubmission, allowDifferentStartMove = false) {
    const { error: userError } = await this.supabase
      .from("users")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
    if (userError) throw new Error(`Unable to verify account: ${userError.message}`);

    const { data, error } = await this.supabase
      .rpc("enqueue_puzzle_submission", {
        p_fen: puzzle.fen,
        p_solution: puzzle.solution,
        p_event: puzzle.event,
        p_event_name: puzzle.eventName,
        p_event_date: puzzle.eventDate,
        p_players: puzzle.players,
        p_white_player: puzzle.whitePlayer,
        p_black_player: puzzle.blackPlayer,
        p_explanation: puzzle.explanation,
        p_submitted_by: username,
        p_allow_different_start_move: allowDifferentStartMove,
      })
      .single();
    if (
      error?.message.includes("Puzzle start move already exists for FEN in queue") ||
      error?.message.includes("Puzzle moves already exist for FEN in queue")
    ) {
      throw new HttpError(
        409,
        "A puzzle with this FEN and starting move is already pending review.",
      );
    }
    if (
      error?.message.includes("Puzzle start move already exists for FEN") ||
      error?.message.includes("Puzzle moves already exist for FEN")
    ) {
      throw new HttpError(409, "A puzzle with this FEN and starting move already exists.");
    }
    if (error?.message.includes("Puzzle FEN exists with different start move")) {
      throw new HttpError(409, DIFFERENT_START_MOVE_CONFIRMATION);
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
    if (
      error?.message.includes("Puzzle start move already exists for FEN in queue") ||
      error?.message.includes("Puzzle moves already exist for FEN in queue")
    ) {
      throw new HttpError(
        409,
        "A puzzle with this FEN and starting move is already pending review.",
      );
    }
    if (
      error?.message.includes("Puzzle start move already exists for FEN") ||
      error?.message.includes("Puzzle moves already exist for FEN")
    ) {
      throw new HttpError(409, "A puzzle with this FEN and starting move already exists.");
    }
    if (error?.message.includes("Puzzle start move is duplicated within this batch")) {
      throw new HttpError(409, "This batch repeats a FEN with the same starting move.");
    }
    if (error?.message.includes("Puzzle FEN exists with different start move")) {
      throw new HttpError(409, DIFFERENT_START_MOVE_CONFIRMATION);
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
