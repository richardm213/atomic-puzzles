import { queryOptions } from "@tanstack/react-query";

import {
  type CommunityCommentTargetFilter,
  type CommunityTarget,
  fetchCommunityDiscussion,
  fetchCommunityUsers,
  fetchPuzzleCommunity,
  fetchPuzzleRankings,
  fetchSiteCommunityComments,
  type ProfileCommentSort,
} from "./puzzleCommunity";

const COMMUNITY_STALE_TIME_MS = 30_000;

export const communityQueryKeys = {
  discussions: ["community", "discussion"] as const,
  puzzleRankings: ["community", "puzzle-rankings"] as const,
  siteComments: ["community", "site-comments"] as const,
  users: ["community", "users"] as const,
};

export const communityDiscussionQueryOptions = (target: CommunityTarget, viewerKey: string) =>
  queryOptions({
    queryKey: [
      ...communityQueryKeys.discussions,
      target.type,
      target.id,
      target.context ?? "",
      viewerKey,
    ] as const,
    queryFn: () =>
      target.type === "puzzle"
        ? fetchPuzzleCommunity(Number(target.id))
        : fetchCommunityDiscussion(target),
    staleTime: COMMUNITY_STALE_TIME_MS,
  });

export const siteCommunityCommentsQueryOptions = (options: {
  page: number;
  pageSize: number;
  sort: ProfileCommentSort;
  targetFilter: CommunityCommentTargetFilter;
  viewerKey: string;
}) =>
  queryOptions({
    queryKey: [
      ...communityQueryKeys.siteComments,
      options.viewerKey,
      options.page,
      options.pageSize,
      options.sort,
      options.targetFilter,
    ] as const,
    queryFn: () => fetchSiteCommunityComments(options),
    staleTime: COMMUNITY_STALE_TIME_MS,
  });

export const puzzleRankingsQueryOptions = () =>
  queryOptions({
    queryKey: communityQueryKeys.puzzleRankings,
    queryFn: fetchPuzzleRankings,
    staleTime: COMMUNITY_STALE_TIME_MS,
  });

export const communityUsersQueryOptions = () =>
  queryOptions({
    queryKey: communityQueryKeys.users,
    queryFn: fetchCommunityUsers,
    staleTime: COMMUNITY_STALE_TIME_MS,
  });
