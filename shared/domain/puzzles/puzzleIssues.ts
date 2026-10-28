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
