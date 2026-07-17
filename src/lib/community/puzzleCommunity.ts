import { postApi } from "../api/postApi";
import {
  type CommunityCommentsPage,
  communityCommentsPageSchema,
  type CommunityDiscussion,
  communityDiscussionSchema,
  type CommunityHistoryComment,
  type CommunityTargetType,
  type ProfileCommentKarma,
  profileCommentKarmaSchema,
  type PuzzleComment,
  type PuzzleCommunity,
  puzzleCommunitySchema,
  type PuzzleVoteCounts,
} from "./schemas";

export type {
  CommunityCommentsPage,
  CommunityDiscussion,
  CommunityHistoryComment,
  CommunityTargetType,
  ProfileCommentKarma,
  PuzzleComment,
  PuzzleCommunity,
  PuzzleVoteCounts,
};

export type CommunityTarget = {
  type: CommunityTargetType;
  id: string;
  context?: string;
};

export type ProfileCommentSort = "recent" | "top";
export type CommunityCommentTargetFilter = CommunityTargetType | "all";

const communityRequest = (body: Record<string, unknown>): Promise<CommunityDiscussion> =>
  postApi("/api/puzzles/community", body, {
    errorMessage: "Unable to load community discussion.",
    invalidMessage: "The discussion service returned incomplete data.",
    schema: communityDiscussionSchema,
  });

export const fetchPuzzleCommunity = (puzzleId: number): Promise<PuzzleCommunity> =>
  communityRequest({ action: "load", puzzleId }).then((result) => {
    const parsed = puzzleCommunitySchema.safeParse(result);
    if (!parsed.success) {
      throw new Error("The puzzle discussion service returned incomplete data.");
    }
    return parsed.data;
  });

const targetRequestBody = (target: CommunityTarget): Record<string, unknown> => ({
  targetType: target.type,
  targetId: target.id,
  targetContext: target.context ?? "",
});

export const fetchCommunityDiscussion = (target: CommunityTarget): Promise<CommunityDiscussion> =>
  communityRequest({ action: "loadDiscussion", ...targetRequestBody(target) });

export const saveCommunityCommentVote = (
  target: CommunityTarget,
  commentId: number,
  vote: -1 | 0 | 1,
): Promise<CommunityDiscussion> =>
  communityRequest({ action: "commentVote", ...targetRequestBody(target), commentId, vote });

export const postCommunityComment = (
  target: CommunityTarget,
  body: string,
  parentId: number | null,
): Promise<CommunityDiscussion> =>
  communityRequest({ action: "comment", ...targetRequestBody(target), body, parentId });

export const savePuzzleVote = (puzzleId: number, vote: -1 | 0 | 1): Promise<PuzzleCommunity> =>
  communityRequest({ action: "vote", puzzleId, vote }).then((result) => {
    const parsed = puzzleCommunitySchema.safeParse(result);
    if (!parsed.success) throw new Error("The puzzle discussion service returned incomplete data.");
    return parsed.data;
  });

export const fetchProfileCommunityComments = async (
  username: string,
  options: {
    page?: number;
    pageSize?: number;
    sort?: ProfileCommentSort;
  } = {},
): Promise<CommunityCommentsPage> => {
  const { page = 1, pageSize = 25, sort = "recent" } = options;
  return postApi(
    "/api/puzzles/community",
    { action: "profileComments", username, page, pageSize, sort },
    {
      errorMessage: "Unable to load comment history.",
      invalidMessage: "The comment history service returned incomplete data.",
      schema: communityCommentsPageSchema,
    },
  );
};

export const fetchSiteCommunityComments = async (
  options: {
    page?: number;
    pageSize?: number;
    sort?: ProfileCommentSort;
    targetFilter?: CommunityCommentTargetFilter;
  } = {},
): Promise<CommunityCommentsPage> => {
  const { page = 1, pageSize = 25, sort = "recent", targetFilter = "all" } = options;
  return postApi(
    "/api/puzzles/community",
    { action: "siteComments", page, pageSize, sort, targetFilter },
    {
      errorMessage: "Unable to load comments.",
      invalidMessage: "The comments service returned incomplete data.",
      schema: communityCommentsPageSchema,
    },
  );
};

export const fetchProfileCommentKarma = async (username: string): Promise<number> => {
  const result = await postApi(
    "/api/puzzles/community",
    { action: "profileKarma", username },
    {
      errorMessage: "Unable to load comment karma.",
      invalidMessage: "The comment karma service returned incomplete data.",
      schema: profileCommentKarmaSchema,
    },
  );
  return result.karma;
};
