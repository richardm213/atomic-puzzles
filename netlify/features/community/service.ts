import type { CommunityRequest, CommunityTargetType } from "../../../src/lib/community/schemas";
import { HttpError } from "../../http/errors";
import type { CommunityRepository } from "./repository";
import { type ProfileCommentCountRecord, type ProfileCommentRecord } from "./repository";

export type CommunityTarget = {
  type: CommunityTargetType;
  id: string;
  context: string;
};

const MAX_COMMENT_LENGTH = 10_000;

export const isPublicCommunityReadAction = (action: unknown): boolean =>
  ["load", "loadDiscussion", "profileComments", "profileKarma", "siteComments"].includes(
    String(action),
  );

export const sumCommentKarma = (votes: Array<{ vote: unknown }>): number =>
  votes.reduce((karma, row) => {
    const vote = Number(row.vote);
    return karma + (vote === 1 || vote === -1 ? vote : 0);
  }, 0);

export const sortProfileCommentRecords = (
  comments: ProfileCommentRecord[],
  commentCounts: ProfileCommentCountRecord[],
  sort: "recent" | "top",
): ProfileCommentRecord[] => {
  const scoreByCommentId = new Map(
    commentCounts.map((row) => [Number(row.comment_id), Number(row.score ?? 0)]),
  );
  const compareRecent = (left: ProfileCommentRecord, right: ProfileCommentRecord): number => {
    const timeDifference =
      new Date(String(right.created_at ?? "")).getTime() -
      new Date(String(left.created_at ?? "")).getTime();
    return timeDifference || Number(right.id) - Number(left.id);
  };
  return [...comments].sort((left, right) => {
    if (sort === "top") {
      const scoreDifference =
        (scoreByCommentId.get(Number(right.id)) ?? 0) -
        (scoreByCommentId.get(Number(left.id)) ?? 0);
      if (scoreDifference) return scoreDifference;
    }
    return compareRecent(left, right);
  });
};

export const buildProfileCommentRows = (
  comments: Array<{
    id: number | string;
    puzzle_id: number | string;
    username?: string | null;
    body: string | null;
    created_at: string | null;
  }>,
  commentCounts: Array<{ comment_id: number | string; upvotes: number | string | null }>,
  attemptedPuzzles: Array<{ puzzle_id: number | string }>,
) => {
  const upvotesByCommentId = new Map(
    commentCounts.map((row) => [Number(row.comment_id), Number(row.upvotes)]),
  );
  const attemptedPuzzleIds = new Set(attemptedPuzzles.map((row) => String(row.puzzle_id)));
  return comments.map((comment) => {
    const contentHidden = !attemptedPuzzleIds.has(String(comment.puzzle_id));
    return {
      id: Number(comment.id),
      puzzle_id: Number(comment.puzzle_id),
      username: String(comment.username ?? ""),
      body: contentHidden ? null : String(comment.body ?? ""),
      created_at: String(comment.created_at ?? ""),
      upvotes: upvotesByCommentId.get(Number(comment.id)) ?? 0,
      content_hidden: contentHidden,
    };
  });
};

const buildCommunityHistoryRows = (
  comments: ProfileCommentRecord[],
  commentCounts: ProfileCommentCountRecord[],
  attemptedPuzzles: Array<{ puzzle_id: number | string }>,
) => {
  const upvotesByCommentId = new Map(
    commentCounts.map((row) => [Number(row.comment_id), Number(row.upvotes)]),
  );
  const attemptedPuzzleIds = new Set(attemptedPuzzles.map((row) => String(row.puzzle_id)));
  return comments.map((comment) => {
    const contentHidden =
      comment.target_type === "puzzle" && !attemptedPuzzleIds.has(comment.target_id);
    return {
      id: Number(comment.id),
      target_type: comment.target_type,
      target_id: comment.target_id,
      target_context: comment.target_context,
      puzzle_id: comment.target_type === "puzzle" ? Number(comment.target_id) : null,
      username: String(comment.username ?? ""),
      body: contentHidden ? null : String(comment.body ?? ""),
      created_at: String(comment.created_at ?? ""),
      upvotes: upvotesByCommentId.get(Number(comment.id)) ?? 0,
      content_hidden: contentHidden,
    };
  });
};

export const readCommunityTarget = (input: CommunityRequest): CommunityTarget | null => {
  const targetType = input.targetType ?? (input.puzzleId ? "puzzle" : undefined);
  const rawTargetId = input.targetId ?? input.puzzleId;
  if (targetType === "puzzle") {
    const puzzleId = Number(rawTargetId);
    return Number.isSafeInteger(puzzleId) && puzzleId > 0
      ? { type: "puzzle", id: String(puzzleId), context: "" }
      : null;
  }
  if (targetType === "profile") {
    const username = typeof rawTargetId === "string" ? rawTargetId.trim().toLowerCase() : "";
    return username && username.length <= 100
      ? { type: "profile", id: username, context: "" }
      : null;
  }
  if (targetType === "match") {
    const id = typeof rawTargetId === "string" ? rawTargetId.trim() : "";
    const context = input.targetContext?.trim().toLowerCase() ?? "";
    return id && id.length <= 255 && context && context.length <= 50
      ? { type: "match", id, context }
      : null;
  }
  return null;
};

export class CommunityService {
  constructor(private readonly repository: CommunityRepository) {}

  async canonicalizeTarget(target: CommunityTarget): Promise<CommunityTarget> {
    return this.repository.resolveCanonicalTarget(target);
  }

  async loadProfileCommentKarma(profileUsername: string) {
    const pageSize = 1_000;
    let from = 0;
    let karma = 0;
    while (true) {
      const votes = await this.repository.listCommentVotes(profileUsername, from, pageSize);
      karma += sumCommentKarma(votes);
      if (votes.length < pageSize) break;
      from += pageSize;
    }
    return { karma };
  }

  async loadProfileComments(options: {
    profileUsername: string | null;
    viewerUsername: string | null;
    page: number;
    pageSize: number;
    sort: "recent" | "top";
    targetFilter: CommunityTarget["type"] | null;
  }) {
    const databasePageSize = 1_000;
    const allComments: ProfileCommentRecord[] = [];
    let from = 0;
    while (true) {
      const rows = await this.repository.listHistoryComments(
        options.profileUsername,
        options.targetFilter,
        from,
        databasePageSize,
      );
      allComments.push(...rows);
      if (rows.length < databasePageSize) break;
      from += databasePageSize;
    }
    const commentCounts: ProfileCommentCountRecord[] = [];
    const commentIds = allComments.map((comment) => Number(comment.id));
    for (let index = 0; index < commentIds.length; index += 200) {
      commentCounts.push(
        ...(await this.repository.listCommentCounts(commentIds.slice(index, index + 200))),
      );
    }
    const pageFrom = (options.page - 1) * options.pageSize;
    const comments = sortProfileCommentRecords(allComments, commentCounts, options.sort).slice(
      pageFrom,
      pageFrom + options.pageSize,
    );
    const puzzleIds = [
      ...new Set(
        comments
          .filter((comment) => comment.target_type === "puzzle")
          .map((comment) => Number(comment.target_id)),
      ),
    ];
    const attempted = await this.repository.listAttemptedPuzzles(options.viewerUsername, puzzleIds);
    return {
      comments: buildCommunityHistoryRows(comments, commentCounts, attempted),
      total: allComments.length,
      page: options.page,
      pageSize: options.pageSize,
      sort: options.sort,
    };
  }

  async loadDiscussion(target: CommunityTarget, username: string | null) {
    const rows = await this.repository.loadDiscussionRows(target, username);
    const counts = new Map(rows.counts.map((row) => [Number(row.comment_id), row]));
    const viewerVotes = new Map(
      rows.viewerVotes.map((row) => [Number(row.comment_id), Number(row.vote)]),
    );
    return {
      comments: rows.comments.map((comment) => {
        const count = counts.get(Number(comment.id));
        return {
          ...comment,
          upvotes: Number(count?.upvotes ?? 0),
          downvotes: Number(count?.downvotes ?? 0),
          score: Number(count?.score ?? 0),
          viewer_vote: Number(viewerVotes.get(Number(comment.id)) ?? 0),
        };
      }),
    };
  }

  async loadTargetCommunity(target: CommunityTarget, username: string | null) {
    const discussion = await this.loadDiscussion(target, username);
    if (target.type !== "puzzle") return discussion;
    const puzzleId = Number(target.id);
    const voteRows = await this.repository.loadPuzzleVoteRows(puzzleId, username);
    return {
      ...discussion,
      counts: voteRows.counts ?? { puzzle_id: puzzleId, upvotes: 0, downvotes: 0, score: 0 },
      viewerVote: Number(voteRows.viewerVote?.vote ?? 0),
    };
  }

  async voteOnPuzzle(puzzleId: number, username: string, vote: -1 | 0 | 1) {
    await this.repository.ensureUser(username);
    await this.repository.savePuzzleVote(puzzleId, username, vote);
    return this.loadTargetCommunity(
      { type: "puzzle", id: String(puzzleId), context: "" },
      username,
    );
  }

  async voteOnComment(
    target: CommunityTarget,
    commentId: number,
    username: string,
    vote: -1 | 0 | 1,
  ) {
    await this.repository.ensureUser(username);
    if (!(await this.repository.commentBelongsToTarget(commentId, target))) {
      throw new HttpError(400, "That comment does not belong to this discussion.");
    }
    await this.repository.saveCommentVote(commentId, username, vote);
    return this.loadTargetCommunity(target, username);
  }

  async createComment(
    target: CommunityTarget,
    username: string,
    body: string,
    parentId: number | null,
  ) {
    const commentBody = body.trim();
    if (!commentBody || commentBody.length > MAX_COMMENT_LENGTH) {
      throw new HttpError(
        400,
        `Comment must be between 1 and ${MAX_COMMENT_LENGTH.toLocaleString()} characters.`,
      );
    }
    await this.repository.ensureUser(username);
    await this.repository.createComment(target, username, commentBody, parentId);
    return this.loadTargetCommunity(target, username);
  }
}
