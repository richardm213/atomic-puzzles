import type {
  PuzzleIssue,
  PuzzleIssueCategory,
  PuzzleIssueStatus,
} from "../../../shared/domain/puzzles/puzzleIssues";
import { createPostApi } from "../api/postApi";

export type {
  PuzzleIssue,
  PuzzleIssueCategory,
  PuzzleIssueStatus,
} from "../../../shared/domain/puzzles/puzzleIssues";

const issueRequest = createPostApi("/api/puzzles/issues", {
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
