import type { CommunityTargetType } from "../../../shared/domain/community/schemas";

export type CommunityTarget = {
  type: CommunityTargetType;
  id: string;
  context: string;
};

export type ProfileCommentRecord = {
  id: number | string;
  target_type: CommunityTarget["type"];
  target_id: string;
  target_context: string;
  username?: string | null;
  body: string | null;
  created_at: string | null;
};

export type ProfileCommentCountRecord = {
  comment_id: number | string;
  upvotes: number | string | null;
  score?: number | string | null;
};

export type CommunityUsernameRecord = { username?: string | null };

export type CommunityPuzzleVoteRecord = CommunityUsernameRecord & {
  vote: number | string | null;
};

export type CommunityCommentVoteRecord = {
  username?: string | null;
  vote: number | string | null;
  comment?: CommunityUsernameRecord | CommunityUsernameRecord[] | null;
};

export type PuzzleAttemptRecord = {
  username?: string | null;
  puzzle_id?: number | string | null;
  puzzle_correct?: boolean | null;
};

export type CommunityUserStatRow = {
  username: string;
  puzzles_upvoted: number;
  puzzles_downvoted: number;
  comment_karma: number;
  comments_left: number;
};
