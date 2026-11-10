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
  opaStyle: boolean;
  author: string;
  tags: string[];
  positionMoves?: string[];
  gameInitialFen?: string;
};

export class PuzzleSubmissionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async findPuzzleAtStartingPosition(position: string): Promise<number | null> {
    // Match the position fields literally, allowing whitespace and optional numeric counters.
    const fields = position.split(" ").map((field) => field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = `^[[:space:]]*${fields.join("[[:space:]]+")}([[:space:]]+[0-9]+){0,2}[[:space:]]*$`;
    const { data, error } = await this.supabase
      .from("puzzles")
      .select("id")
      .is("deleted_at", null)
      .eq("has_solution", true)
      .filter("fen", "match", pattern)
      .order("id")
      .limit(1)
      .maybeSingle<{ id: number }>();
    if (error) throw new Error(`Unable to check the starting FEN: ${error.message}`);
    return data?.id ?? null;
  }

  private async ensureUser(username: string) {
    const { error: userError } = await this.supabase
      .from("users")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
    if (userError) throw new Error(`Unable to verify account: ${userError.message}`);
  }

  async enqueue(username: string, puzzle: QueuedPuzzleSubmission, allowDifferentStartMove = false) {
    await this.ensureUser(username);
    const request = puzzle.positionMoves
      ? this.supabase.rpc("enqueue_puzzle_with_position_history", {
          p_puzzle: puzzle,
          p_submitted_by: username,
          p_allow_different_start_move: allowDifferentStartMove,
        })
      : this.supabase.rpc("enqueue_puzzle_submission", {
          p_fen: puzzle.fen,
          p_solution: puzzle.solution,
          p_event: puzzle.event,
          p_event_name: puzzle.eventName,
          p_event_date: puzzle.eventDate,
          p_players: puzzle.players,
          p_white_player: puzzle.whitePlayer,
          p_black_player: puzzle.blackPlayer,
          p_explanation: puzzle.explanation,
          p_opa_style: puzzle.opaStyle,
          p_author: puzzle.author,
          p_tags: puzzle.tags,
          p_submitted_by: username,
          p_allow_different_start_move: allowDifferentStartMove,
        });
    const { data, error } = await request.single();
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

  async publishBatch(
    username: string,
    puzzles: QueuedPuzzleSubmission[],
    allowDifferentStartMove = false,
  ): Promise<number[]> {
    await this.ensureUser(username);

    const { data, error } = await this.supabase.rpc("publish_approved_puzzle_batch", {
      p_puzzles: puzzles,
      p_submitted_by: username,
      p_allow_different_start_move: allowDifferentStartMove,
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

  async saveMatchPuzzle(input: {
    username: string;
    puzzle: QueuedPuzzleSubmission;
    gameId: string;
    matchId: string;
    existingSetId: number | null;
    renameFrom?: string | undefined;
    publish: boolean;
    allowDifferentStartMove: boolean;
  }) {
    await this.ensureUser(input.username);
    const { data, error } = await this.supabase.rpc("save_match_puzzle", {
      p_puzzle: input.puzzle,
      p_submitted_by: input.username,
      p_game_id: input.gameId,
      p_match_id: input.matchId,
      p_legacy_set_id: input.existingSetId,
      p_publish: input.publish,
      p_allow_different_start_move: input.allowDifferentStartMove,
      ...(input.renameFrom ? { p_rename_from: input.renameFrom } : {}),
    });
    const message = error?.message ?? "";
    if (message.includes("Puzzle start move already exists for FEN in queue")) {
      throw new HttpError(
        409,
        "A puzzle with this FEN and starting move is already pending review.",
      );
    }
    if (message.includes("Puzzle start move already exists for FEN")) {
      throw new HttpError(409, "A puzzle with this FEN and starting move already exists.");
    }
    if (message.includes("Puzzle FEN exists with different start move")) {
      throw new HttpError(409, DIFFERENT_START_MOVE_CONFIRMATION);
    }
    if (message.includes("Puzzle set belongs to another match")) {
      throw new HttpError(
        409,
        "That set name is already used for another match. Choose another name.",
      );
    }
    if (message.includes("Match set name changed")) {
      throw new HttpError(409, "This set can no longer be renamed. Reopen the puzzle editor.");
    }
    if (message.includes("Match set name already in use")) {
      throw new HttpError(409, "That set name is already in use. Choose another name.");
    }
    if (error) throw new Error(`Unable to save match puzzle: ${message}`);
    return data;
  }
}
