import {
  puzzleTagVoteEventsPageSchema,
  puzzleTagVoteReviewSchema,
} from "../../../shared/domain/puzzles/puzzleTagVotes";
import { createPostApi } from "../api/postApi";
import type { PuzzleSubmissionValue } from "../puzzles/puzzleSubmission";
import type { PuzzleProgressWithUsernameRow } from "./types";

export type AdminPuzzle = {
  id: number;
  fen: string;
  solution: string;
  author: string;
  event: string;
  event_name: string;
  event_date: string;
  players: string[];
  white_player: string;
  black_player: string;
  explanation: string;
  opa_style: boolean;
  tags: string[];
  created_at: string;
  deleted_at: string | null;
  deleted_by: string | null;
};

export type AdminPuzzleResponse = {
  puzzle: AdminPuzzle | null;
  olderPuzzleId: number | null;
  newerPuzzleId: number | null;
  attempts: PuzzleProgressWithUsernameRow[];
};

const adminRequest = createPostApi("/api/puzzles/admin", {
  errorMessage: "Unable to administer puzzle.",
  invalidMessage: "The puzzle administration service returned invalid data.",
});

export const fetchAdminPuzzle = (
  puzzleId?: number,
  direction: "latest" | "exact" | "older" | "newer" = "latest",
): Promise<AdminPuzzleResponse> =>
  adminRequest<AdminPuzzleResponse>({
    action: "get",
    ...(puzzleId === undefined ? {} : { puzzleId }),
    direction,
  });

export const fetchAdminPuzzleTagVotes = (
  puzzleId: number,
  beforeId: number | null,
  signal: AbortSignal,
) =>
  adminRequest(
    { action: "tag-votes", puzzleId, ...(beforeId === null ? {} : { beforeId }) },
    {
      schema: puzzleTagVoteEventsPageSchema,
      signal,
      errorMessage: "Unable to load tag vote history.",
    },
  );

export const markAdminPuzzleTagVoteIncorrect = (puzzleId: number, voteId: number) =>
  adminRequest(
    { action: "mark-tag-vote-incorrect", puzzleId, voteId },
    { schema: puzzleTagVoteReviewSchema, errorMessage: "Unable to mark tag vote incorrect." },
  );

export const updateAdminPuzzle = (
  puzzleId: number,
  value: PuzzleSubmissionValue,
  author: string,
  tags: string[],
): Promise<AdminPuzzleResponse> =>
  adminRequest<AdminPuzzleResponse>({
    action: "update",
    puzzleId,
    fen: value.fen,
    solution: value.solution,
    author,
    event: value.event,
    whitePlayer: value.whitePlayer ?? "",
    blackPlayer: value.blackPlayer ?? "",
    explanation: value.explanation,
    opaStyle: value.opaStyle === true,
    tags,
  });

export const deleteAdminPuzzle = (puzzleId: number): Promise<AdminPuzzleResponse> =>
  adminRequest<AdminPuzzleResponse>({ action: "delete", puzzleId });

export const restoreAdminPuzzle = (puzzleId: number): Promise<AdminPuzzleResponse> =>
  adminRequest<AdminPuzzleResponse>({ action: "restore", puzzleId });
