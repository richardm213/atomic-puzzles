import { postApi } from "../api/postApi";

export type PuzzleIssueCategory = "missing_alternate_solution" | "incorrect_solution" | "other";
export type PuzzleIssueStatus = "open" | "resolved" | "dismissed";

export type PuzzleIssue = {
  id: number;
  puzzle_id: number;
  reporter_username: string;
  category: PuzzleIssueCategory;
  details: string;
  status: PuzzleIssueStatus;
  created_at: string;
  updated_at?: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
};

const issueRequest = <T>(body: Record<string, unknown>): Promise<T> =>
  postApi("/api/puzzles/issues", body, {
    errorMessage: "Unable to manage puzzle issues.",
    invalidMessage: "The puzzle issue service returned no data.",
  });

export const reportPuzzleIssue = (
  puzzleId: number,
  category: PuzzleIssueCategory,
  details: string,
): Promise<{ issue: PuzzleIssue }> =>
  issueRequest({ action: "create", puzzleId, category, details });

export const fetchPuzzleIssues = (): Promise<{ issues: PuzzleIssue[] }> =>
  issueRequest({ action: "list" });

export const setPuzzleIssueStatus = (
  id: number,
  status: PuzzleIssueStatus,
): Promise<{ issue: PuzzleIssue }> => issueRequest({ action: "setStatus", id, status });
