import { z } from "zod";

const positiveIntegerSchema = z.coerce.number().int().positive().safe();
const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .transform((value) => value.toLowerCase());

export const communityTargetTypeSchema = z.enum(["puzzle", "profile", "match", "tournament"]);
export type CommunityTargetType = z.infer<typeof communityTargetTypeSchema>;

export const communityRequestSchema = z
  .object({
    action: z.enum([
      "load",
      "loadDiscussion",
      "vote",
      "comment",
      "commentVote",
      "profileComments",
      "profileKarma",
      "siteComments",
      "puzzleRankings",
      "communityUsers",
    ]),
    puzzleId: positiveIntegerSchema.optional(),
    targetType: communityTargetTypeSchema.optional(),
    targetId: z.union([z.string(), z.number()]).optional(),
    targetContext: z.string().optional(),
    targetFilter: z.union([communityTargetTypeSchema, z.literal("all")]).optional(),
    username: usernameSchema.optional(),
    page: positiveIntegerSchema.optional(),
    pageSize: positiveIntegerSchema.optional(),
    sort: z.enum(["recent", "top"]).optional(),
    vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
    commentId: positiveIntegerSchema.optional(),
    parentId: positiveIntegerSchema.nullish(),
    body: z.string().optional(),
  })
  .superRefine((input, context) => {
    if (["profileComments", "profileKarma"].includes(input.action) && !input.username) {
      context.addIssue({ code: "custom", message: "A profile username is required." });
    }
    if (["load", "vote"].includes(input.action) && !input.puzzleId) {
      context.addIssue({ code: "custom", message: "A puzzle identifier is required." });
    }
    if (["vote", "commentVote"].includes(input.action) && input.vote === undefined) {
      context.addIssue({ code: "custom", message: "A vote is required." });
    }
    if (input.action === "commentVote" && !input.commentId) {
      context.addIssue({ code: "custom", message: "A comment identifier is required." });
    }
    if (input.action === "comment" && input.body === undefined) {
      context.addIssue({ code: "custom", message: "A comment body is required." });
    }
    if (["loadDiscussion", "comment", "commentVote"].includes(input.action)) {
      const targetType = input.targetType ?? (input.puzzleId ? "puzzle" : undefined);
      const targetId = input.targetId ?? input.puzzleId;
      if (!targetType || targetId === undefined) {
        context.addIssue({ code: "custom", message: "A discussion target is required." });
      } else if (targetType === "match" && !input.targetContext?.trim()) {
        context.addIssue({ code: "custom", message: "A match context is required." });
      }
    }
  });

export type CommunityRequest = z.output<typeof communityRequestSchema>;

export const puzzleVoteCountsSchema = z.object({
  puzzle_id: z.coerce.number(),
  upvotes: z.coerce.number(),
  downvotes: z.coerce.number(),
  score: z.coerce.number(),
});

export const puzzleVoteRankingRowSchema = puzzleVoteCountsSchema.extend({
  attempts: z.coerce.number(),
  solve_rate: z.coerce.number().nullable(),
});

export const communityCommentSchema = z.object({
  id: z.coerce.number(),
  puzzle_id: z.coerce.number().optional(),
  target_type: communityTargetTypeSchema.optional(),
  target_id: z.string().optional(),
  target_context: z.string().optional(),
  username: z.string(),
  parent_id: z.coerce.number().nullable(),
  body: z.string(),
  created_at: z.string(),
  upvotes: z.coerce.number(),
  downvotes: z.coerce.number(),
  score: z.coerce.number(),
  viewer_vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

export const communityDiscussionSchema = z.object({
  comments: z.array(communityCommentSchema),
  counts: puzzleVoteCountsSchema.optional(),
  viewerVote: z.union([z.literal(-1), z.literal(0), z.literal(1)]).optional(),
});

export const puzzleCommunitySchema = communityDiscussionSchema.extend({
  counts: puzzleVoteCountsSchema,
  viewerVote: z.union([z.literal(-1), z.literal(0), z.literal(1)]),
});

export const communityHistoryCommentSchema = z.object({
  id: z.coerce.number(),
  target_type: communityTargetTypeSchema,
  target_id: z.string(),
  target_context: z.string(),
  puzzle_id: z.coerce.number().nullable(),
  username: z.string(),
  body: z.string().nullable(),
  created_at: z.string(),
  upvotes: z.coerce.number(),
  content_hidden: z.boolean(),
});

export const communityCommentsPageSchema = z.object({
  comments: z.array(communityHistoryCommentSchema),
  total: z.coerce.number(),
  page: z.coerce.number(),
  pageSize: z.coerce.number(),
  sort: z.enum(["recent", "top"]),
});

export const puzzleRankingsSchema = z.object({
  puzzles: z.array(puzzleVoteRankingRowSchema),
});

export const communityUserStatsSchema = z.object({
  username: z.string(),
  puzzles_upvoted: z.coerce.number(),
  puzzles_downvoted: z.coerce.number(),
  comment_karma: z.coerce.number(),
  comments_left: z.coerce.number(),
});

export const communityUsersSchema = z.object({
  users: z.array(communityUserStatsSchema),
});

export type PuzzleVoteCounts = z.infer<typeof puzzleVoteCountsSchema>;
export type PuzzleComment = z.infer<typeof communityCommentSchema>;
export type CommunityDiscussion = z.infer<typeof communityDiscussionSchema>;
export type PuzzleCommunity = z.infer<typeof puzzleCommunitySchema>;
export type CommunityHistoryComment = z.infer<typeof communityHistoryCommentSchema>;
export type CommunityCommentsPage = z.infer<typeof communityCommentsPageSchema>;
export type PuzzleRankings = z.infer<typeof puzzleRankingsSchema>;
export type PuzzleVoteRankingRow = z.infer<typeof puzzleVoteRankingRowSchema>;
export type CommunityUserStats = z.infer<typeof communityUserStatsSchema>;
