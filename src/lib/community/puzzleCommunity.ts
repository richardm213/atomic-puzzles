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
  puzzle_id?: number;
  target_type?: CommunityTargetType;
  target_id?: string;
  target_context?: string;
  username: string;
  parent_id: number | null;
  body: string;
  created_at: string;
  upvotes: number;
  downvotes: number;
  score: number;
  viewer_vote: -1 | 0 | 1;
};

export type CommunityTargetType = "puzzle" | "profile" | "match";

export type CommunityTarget = {
  type: CommunityTargetType;
  id: string;
  context?: string;
};

export type CommunityDiscussion = {
  comments: PuzzleComment[];
  counts?: PuzzleVoteCounts;
  viewerVote?: -1 | 0 | 1;
};

export type PuzzleCommunity = {
  counts: PuzzleVoteCounts;
  comments: PuzzleComment[];
  viewerVote: -1 | 0 | 1;
};

export type CommunityHistoryComment = {
  id: number;
  target_type: CommunityTargetType;
  target_id: string;
  target_context: string;
  puzzle_id: number | null;
  username: string;
  body: string | null;
  created_at: string;
  upvotes: number;
  content_hidden: boolean;
};

export type CommunityCommentsPage = {
  comments: CommunityHistoryComment[];
  total: number;
  page: number;
  pageSize: number;
  sort: ProfileCommentSort;
};

export type ProfileCommentSort = "recent" | "top";
export type CommunityCommentTargetFilter = CommunityTargetType | "all";

export type ProfileCommentKarma = {
  karma: number;
};

const communityRequest = async (
  body: Record<string, unknown>,
  accessToken = "",
): Promise<CommunityDiscussion> => {
  const response = await fetch(appAssetPath("/api/puzzles/community"), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  invalidateLichessSessionForResponse(response, accessToken);
  const result = (await response.json().catch(() => null)) as
    | (CommunityDiscussion & { error?: string })
    | null;
  if (!response.ok) throw new Error(result?.error || "Unable to load community discussion.");
  if (!result || !Array.isArray(result.comments)) {
    throw new Error("The discussion service returned incomplete data.");
  }
  return result;
};

export const fetchPuzzleCommunity = (
  puzzleId: number,
  accessToken = "",
): Promise<PuzzleCommunity> =>
  communityRequest({ action: "load", puzzleId }, accessToken).then((result) => {
    if (!result.counts || result.viewerVote === undefined) {
      throw new Error("The puzzle discussion service returned incomplete data.");
    }
    return result as PuzzleCommunity;
  });

const targetRequestBody = (target: CommunityTarget): Record<string, unknown> => ({
  targetType: target.type,
  targetId: target.id,
  targetContext: target.context ?? "",
});

export const fetchCommunityDiscussion = (
  target: CommunityTarget,
  accessToken = "",
): Promise<CommunityDiscussion> =>
  communityRequest({ action: "loadDiscussion", ...targetRequestBody(target) }, accessToken);

export const saveCommunityCommentVote = (
  target: CommunityTarget,
  commentId: number,
  vote: -1 | 0 | 1,
  accessToken: string,
): Promise<CommunityDiscussion> =>
  communityRequest(
    { action: "commentVote", ...targetRequestBody(target), commentId, vote },
    accessToken,
  );

export const postCommunityComment = (
  target: CommunityTarget,
  body: string,
  parentId: number | null,
  accessToken: string,
): Promise<CommunityDiscussion> =>
  communityRequest(
    { action: "comment", ...targetRequestBody(target), body, parentId },
    accessToken,
  );

export const savePuzzleVote = (
  puzzleId: number,
  vote: -1 | 0 | 1,
  accessToken: string,
): Promise<PuzzleCommunity> =>
  communityRequest({ action: "vote", puzzleId, vote }, accessToken).then(
    (result) => result as PuzzleCommunity,
  );

export const fetchProfileCommunityComments = async (
  username: string,
  options: {
    page?: number;
    pageSize?: number;
    accessToken?: string;
    sort?: ProfileCommentSort;
  } = {},
): Promise<CommunityCommentsPage> => {
  const { page = 1, pageSize = 25, accessToken = "", sort = "recent" } = options;
  const response = await fetch(appAssetPath("/api/puzzles/community"), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "profileComments", username, page, pageSize, sort }),
  });
  invalidateLichessSessionForResponse(response, accessToken);
  const result = (await response.json().catch(() => null)) as
    | (CommunityCommentsPage & { error?: string })
    | null;

  if (!response.ok) throw new Error(result?.error || "Unable to load comment history.");
  if (!result || !Array.isArray(result.comments)) {
    throw new Error("The comment history service returned incomplete data.");
  }

  return result;
};

export const fetchSiteCommunityComments = async (
  options: {
    page?: number;
    pageSize?: number;
    accessToken?: string;
    sort?: ProfileCommentSort;
    targetFilter?: CommunityCommentTargetFilter;
  } = {},
): Promise<CommunityCommentsPage> => {
  const {
    page = 1,
    pageSize = 25,
    accessToken = "",
    sort = "recent",
    targetFilter = "all",
  } = options;
  const response = await fetch(appAssetPath("/api/puzzles/community"), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "siteComments", page, pageSize, sort, targetFilter }),
  });
  invalidateLichessSessionForResponse(response, accessToken);
  const result = (await response.json().catch(() => null)) as
    | (CommunityCommentsPage & { error?: string })
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
    credentials: "same-origin",
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
