import type { SupabaseClient } from "@supabase/supabase-js";

import { HttpError } from "../../../platform/errors";

const PUZZLE_COLUMNS =
  "id,fen,solution,author,event,event_name,event_date,players,white_player,black_player," +
  "explanation,opa_style,tags,created_at,deleted_at,deleted_by";

type AdminPuzzleRow = {
  id: number;
  fen: string;
  solution: string;
  author: string;
  event: string | null;
  event_name: string | null;
  event_date: string | null;
  players: string[] | null;
  white_player: string | null;
  black_player: string | null;
  explanation: string | null;
  opa_style: boolean | null;
  tags: string[] | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type AdminPuzzleUpdate = {
  fen: string;
  solution: string;
  author: string;
  event: string;
  whitePlayer: string;
  blackPlayer: string;
  explanation: string;
  opaStyle: boolean;
  tags: string[];
};

export class PuzzleAdminRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  private async loadPuzzle(
    puzzleId?: number,
    direction: "latest" | "exact" | "older" | "newer" = "latest",
  ): Promise<AdminPuzzleRow | null> {
    let query = this.supabase.from("puzzles").select(PUZZLE_COLUMNS);

    if (direction === "exact" && puzzleId !== undefined) {
      query = query.eq("id", puzzleId);
    } else if (direction === "older" && puzzleId !== undefined) {
      query = query.lt("id", puzzleId).order("id", { ascending: false });
    } else if (direction === "newer" && puzzleId !== undefined) {
      query = query.gt("id", puzzleId).order("id", { ascending: true });
    } else {
      query = query.order("id", { ascending: false });
    }

    const { data, error } = await query.limit(1).maybeSingle();
    if (error) throw new Error(`Unable to load puzzle: ${error.message}`);
    return (data as unknown as AdminPuzzleRow | null) ?? null;
  }

  async get(puzzleId?: number, direction?: "latest" | "exact" | "older" | "newer") {
    const puzzle = await this.loadPuzzle(puzzleId, direction);
    if (!puzzle) return { puzzle: null, olderPuzzleId: null, newerPuzzleId: null, attempts: [] };

    const id = Number(puzzle.id);
    const [olderResult, newerResult, attemptsResult] = await Promise.all([
      this.supabase
        .from("puzzles")
        .select("id")
        .lt("id", id)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      this.supabase
        .from("puzzles")
        .select("id")
        .gt("id", id)
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle(),
      this.supabase
        .from("puzzle_progress")
        .select(
          "username,puzzle_id,first_attempt_at,first_attempt_duration_ms,puzzle_correct,rated,incorrect_move,correct_move",
        )
        .eq("puzzle_id", String(id))
        .order("first_attempt_at", { ascending: false })
        .limit(100),
    ]);

    if (olderResult.error) {
      throw new Error(`Unable to find the previous puzzle: ${olderResult.error.message}`);
    }
    if (newerResult.error) {
      throw new Error(`Unable to find the next puzzle: ${newerResult.error.message}`);
    }
    if (attemptsResult.error) {
      throw new Error(`Unable to load puzzle attempts: ${attemptsResult.error.message}`);
    }

    return {
      puzzle,
      olderPuzzleId: olderResult.data ? Number(olderResult.data.id) : null,
      newerPuzzleId: newerResult.data ? Number(newerResult.data.id) : null,
      attempts: attemptsResult.data ?? [],
    };
  }

  async update(puzzleId: number, puzzle: AdminPuzzleUpdate) {
    const { data, error } = await this.supabase
      .from("puzzles")
      .update({
        fen: puzzle.fen,
        solution: puzzle.solution,
        author: puzzle.author,
        event: puzzle.event,
        players: [puzzle.whitePlayer, puzzle.blackPlayer].filter(Boolean),
        white_player: puzzle.whitePlayer,
        black_player: puzzle.blackPlayer,
        explanation: puzzle.explanation,
        opa_style: puzzle.opaStyle,
        tags: puzzle.tags,
      })
      .eq("id", puzzleId)
      .is("deleted_at", null)
      .select(PUZZLE_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`Unable to update puzzle: ${error.message}`);
    if (!data) throw new HttpError(404, "Active puzzle not found.");
    return data;
  }

  async delete(puzzleId: number, username: string): Promise<void> {
    const { error } = await this.supabase.rpc("soft_delete_puzzle", {
      p_puzzle_id: puzzleId,
      p_deleted_by: username,
    });
    if (error) throw new Error(`Unable to delete puzzle: ${error.message}`);
  }

  async restore(puzzleId: number, username: string): Promise<void> {
    const { error } = await this.supabase.rpc("restore_deleted_puzzle", {
      p_puzzle_id: puzzleId,
      p_restored_by: username,
    });
    if (error) throw new Error(`Unable to restore puzzle: ${error.message}`);
  }
}
