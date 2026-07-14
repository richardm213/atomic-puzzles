import { appAssetPath } from "../../utils/appAssetPath";

export type PuzzleVoteCounts = {
  puzzle_id: number;
  upvotes: number;
  downvotes: number;
  score: number;
};

export type PuzzleComment = {
  id: number;
  puzzle_id: number;
  username: string;
  parent_id: number | null;
  body: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  score: number;
  viewer_vote: -1 | 0 | 1;
};

export type PuzzleCommunity = {
  counts: PuzzleVoteCounts;
  comments: PuzzleComment[];
  viewerVote: -1 | 0 | 1;
};

const communityRequest = async (
  body: Record<string, unknown>,
  accessToken = "",
): Promise<PuzzleCommunity> => {
  const response = await fetch(appAssetPath("/api/puzzles/community"), {
    method: "POST",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as
    | (PuzzleCommunity & { error?: string })
    | null;
  if (!response.ok) throw new Error(result?.error || "Unable to load puzzle discussion.");
  if (!result?.counts || !Array.isArray(result.comments)) {
    throw new Error("The puzzle discussion service returned incomplete data.");
  }
  return result;
};

export const fetchPuzzleCommunity = (
  puzzleId: number,
  accessToken = "",
): Promise<PuzzleCommunity> => communityRequest({ action: "load", puzzleId }, accessToken);

export const savePuzzleVote = (
  puzzleId: number,
  vote: -1 | 0 | 1,
  accessToken: string,
): Promise<PuzzleCommunity> => communityRequest({ action: "vote", puzzleId, vote }, accessToken);

export const savePuzzleCommentVote = (
  puzzleId: number,
  commentId: number,
  vote: -1 | 0 | 1,
  accessToken: string,
): Promise<PuzzleCommunity> =>
  communityRequest({ action: "commentVote", puzzleId, commentId, vote }, accessToken);

export const postPuzzleComment = (
  puzzleId: number,
  body: string,
  parentId: number | null,
  accessToken: string,
): Promise<PuzzleCommunity> =>
  communityRequest({ action: "comment", puzzleId, body, parentId }, accessToken);
