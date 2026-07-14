import { appAssetPath } from "../../utils/appAssetPath";
import { invalidateLichessSessionForResponse } from "../auth/lichessAuth";

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

export type ProfilePuzzleComment = {
  id: number;
  puzzle_id: number;
  username: string;
  body: string | null;
  created_at: string;
  upvotes: number;
  content_hidden: boolean;
};

export type ProfilePuzzleCommentsPage = {
  comments: ProfilePuzzleComment[];
  total: number;
  page: number;
  pageSize: number;
  sort: ProfileCommentSort;
};

export type ProfileCommentSort = "recent" | "top";

export type ProfileCommentKarma = {
  karma: number;
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
  invalidateLichessSessionForResponse(response, accessToken);
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

export const fetchProfilePuzzleComments = async (
  username: string,
  options: {
    page?: number;
    pageSize?: number;
    accessToken?: string;
    sort?: ProfileCommentSort;
  } = {},
): Promise<ProfilePuzzleCommentsPage> => {
  const { page = 1, pageSize = 25, accessToken = "", sort = "recent" } = options;
  const response = await fetch(appAssetPath("/api/puzzles/community"), {
    method: "POST",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "profileComments", username, page, pageSize, sort }),
  });
  invalidateLichessSessionForResponse(response, accessToken);
  const result = (await response.json().catch(() => null)) as
    | (ProfilePuzzleCommentsPage & { error?: string })
    | null;

  if (!response.ok) throw new Error(result?.error || "Unable to load comment history.");
  if (!result || !Array.isArray(result.comments)) {
    throw new Error("The comment history service returned incomplete data.");
  }

  return result;
};

export const fetchSitePuzzleComments = async (
  options: {
    page?: number;
    pageSize?: number;
    accessToken?: string;
    sort?: ProfileCommentSort;
  } = {},
): Promise<ProfilePuzzleCommentsPage> => {
  const { page = 1, pageSize = 25, accessToken = "", sort = "recent" } = options;
  const response = await fetch(appAssetPath("/api/puzzles/community"), {
    method: "POST",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "siteComments", page, pageSize, sort }),
  });
  invalidateLichessSessionForResponse(response, accessToken);
  const result = (await response.json().catch(() => null)) as
    | (ProfilePuzzleCommentsPage & { error?: string })
    | null;

  if (!response.ok) throw new Error(result?.error || "Unable to load comments.");
  if (!result || !Array.isArray(result.comments)) {
    throw new Error("The comments service returned incomplete data.");
  }

  return result;
};

export const fetchProfileCommentKarma = async (username: string): Promise<number> => {
  const response = await fetch(appAssetPath("/api/puzzles/community"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "profileKarma", username }),
  });
  const result = (await response.json().catch(() => null)) as
    | (ProfileCommentKarma & { error?: string })
    | null;

  if (!response.ok) throw new Error(result?.error || "Unable to load comment karma.");
  if (!result || !Number.isFinite(Number(result.karma))) {
    throw new Error("The comment karma service returned incomplete data.");
  }

  return Number(result.karma);
};
