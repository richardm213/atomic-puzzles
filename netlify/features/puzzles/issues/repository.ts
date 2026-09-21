import type { SupabaseClient } from "@supabase/supabase-js";

import { HttpError } from "../../../platform/errors";

export type PuzzleIssueCategory = "missing_alternate_solution" | "incorrect_solution" | "other";
export type PuzzleIssueStatus = "open" | "resolved" | "dismissed";

export class PuzzleIssueRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async hasAttemptedPuzzle(username: string, puzzleId: number): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("puzzle_progress")
      .select("puzzle_id")
      .eq("username", username)
      .eq("puzzle_id", String(puzzleId))
      .maybeSingle();
    if (error) throw new Error(`Unable to verify puzzle progress: ${error.message}`);
    return Boolean(data);
  }

  async create(input: {
    puzzleId: number;
    reporterUsername: string;
    category: PuzzleIssueCategory;
    details: string;
  }) {
    const { data, error } = await this.supabase
      .from("puzzle_issues")
      .insert({
        puzzle_id: input.puzzleId,
        reporter_username: input.reporterUsername,
        category: input.category,
        details: input.details,
      })
      .select("id, puzzle_id, reporter_username, category, details, status, created_at")
      .single();
    if (error) {
      if (/duplicate key|puzzle_issues_one_open_report/i.test(error.message)) {
        throw new HttpError(409, "You already have an open report in this category.");
      }
      if (/foreign key/i.test(error.message)) throw new HttpError(404, "Puzzle not found.");
      throw new Error(`Unable to report puzzle issue: ${error.message}`);
    }
    return data;
  }

  async list() {
    const { data, error } = await this.supabase
      .from("puzzle_issues")
      .select(
        "id, puzzle_id, reporter_username, category, details, status, created_at, updated_at, resolved_at, resolved_by",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Unable to load puzzle issues: ${error.message}`);
    return data ?? [];
  }

  async setStatus(id: number, status: PuzzleIssueStatus, reviewer: string) {
    const closed = status !== "open";
    const { data, error } = await this.supabase
      .from("puzzle_issues")
      .update({
        status,
        updated_at: new Date().toISOString(),
        resolved_at: closed ? new Date().toISOString() : null,
        resolved_by: closed ? reviewer : null,
      })
      .eq("id", id)
      .select(
        "id, puzzle_id, reporter_username, category, details, status, created_at, updated_at, resolved_at, resolved_by",
      )
      .single();
    if (error) throw new Error(`Unable to update puzzle issue: ${error.message}`);
    return data;
  }
}
