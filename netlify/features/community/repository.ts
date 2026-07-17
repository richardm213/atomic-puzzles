import type { SupabaseClient } from "@supabase/supabase-js";

import { HttpError } from "../../http/errors";
import type { CommunityTarget } from "./service";

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

export class CommunityRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async resolveCanonicalTarget(target: CommunityTarget): Promise<CommunityTarget> {
    if (target.type !== "profile") return target;
    const result = await this.supabase
      .from("aliases2")
      .select("username")
      .eq("alias", target.id)
      .limit(1)
      .maybeSingle();
    if (result.error) throw new Error(`Unable to resolve profile aliases: ${result.error.message}`);
    const canonical = String(result.data?.username ?? "")
      .trim()
      .toLowerCase();
    return canonical && canonical.length <= 100 ? { ...target, id: canonical } : target;
  }

  async listCommentVotes(username: string, from: number, pageSize: number) {
    const result = await this.supabase
      .from("community_comment_votes")
      .select("vote, comment:community_comments!community_comment_votes_comment_fk!inner(username)")
      .eq("comment.username", username)
      .range(from, from + pageSize - 1);
    if (result.error) throw new Error(`Unable to load comment karma: ${result.error.message}`);
    return result.data ?? [];
  }

  async listHistoryComments(
    profileUsername: string | null,
    targetFilter: CommunityTarget["type"] | null,
    from: number,
    pageSize: number,
  ): Promise<ProfileCommentRecord[]> {
    let query = this.supabase
      .from("community_comments")
      .select("id, target_type, target_id, target_context, username, body, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (profileUsername) query = query.eq("username", profileUsername);
    if (targetFilter) query = query.eq("target_type", targetFilter);
    const result = await query.range(from, from + pageSize - 1);
    if (result.error) throw new Error(`Unable to load comment history: ${result.error.message}`);
    return (result.data ?? []).map((row) => ({
      id: row.id,
      target_type: row.target_type as CommunityTarget["type"],
      target_id: String(row.target_id),
      target_context: String(row.target_context),
      username: row.username,
      body: row.body,
      created_at: row.created_at,
    }));
  }

  async listCommentCounts(commentIds: number[]): Promise<ProfileCommentCountRecord[]> {
    if (!commentIds.length) return [];
    const result = await this.supabase
      .from("community_comment_vote_counts")
      .select("comment_id, upvotes, score")
      .in("comment_id", commentIds);
    if (result.error) throw new Error(`Unable to load comment votes: ${result.error.message}`);
    return result.data ?? [];
  }

  async listAttemptedPuzzles(username: string | null, puzzleIds: number[]) {
    if (!username || !puzzleIds.length) return [];
    const result = await this.supabase
      .from("puzzle_progress")
      .select("puzzle_id")
      .eq("username", username)
      .in("puzzle_id", puzzleIds.map(String));
    if (result.error) {
      throw new Error(`Unable to check attempted puzzles: ${result.error.message}`);
    }
    return result.data ?? [];
  }

  async loadDiscussionRows(target: CommunityTarget, username: string | null) {
    const commentsQuery = this.supabase
      .from("community_comments")
      .select("id, target_type, target_id, target_context, username, parent_id, body, created_at")
      .eq("target_type", target.type)
      .eq("target_id", target.id)
      .eq("target_context", target.context)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    const countsQuery = this.supabase
      .from("community_comment_vote_counts")
      .select("comment_id, upvotes, downvotes, score")
      .eq("target_type", target.type)
      .eq("target_id", target.id)
      .eq("target_context", target.context);
    const [commentsResult, countsResult] = await Promise.all([commentsQuery, countsQuery]);
    if (commentsResult.error) {
      throw new Error(`Unable to load comments: ${commentsResult.error.message}`);
    }
    if (countsResult.error) {
      throw new Error(`Unable to load comment votes: ${countsResult.error.message}`);
    }
    const commentIds = (commentsResult.data ?? []).map((comment) => Number(comment.id));
    const viewerVotesResult =
      username && commentIds.length
        ? await this.supabase
            .from("community_comment_votes")
            .select("comment_id, vote")
            .eq("username", username)
            .in("comment_id", commentIds)
        : { data: [], error: null };
    if (viewerVotesResult.error) {
      throw new Error(`Unable to load your comment votes: ${viewerVotesResult.error.message}`);
    }
    return {
      comments: commentsResult.data ?? [],
      counts: countsResult.data ?? [],
      viewerVotes: viewerVotesResult.data ?? [],
    };
  }

  async loadPuzzleVoteRows(puzzleId: number, username: string | null) {
    const [countsResult, viewerVoteResult] = await Promise.all([
      this.supabase
        .from("puzzle_vote_counts")
        .select("puzzle_id, upvotes, downvotes, score")
        .eq("puzzle_id", puzzleId)
        .maybeSingle(),
      username
        ? this.supabase
            .from("puzzle_votes")
            .select("vote")
            .eq("puzzle_id", puzzleId)
            .eq("username", username)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (countsResult.error) {
      throw new Error(`Unable to load puzzle votes: ${countsResult.error.message}`);
    }
    if (viewerVoteResult.error) {
      throw new Error(`Unable to load your vote: ${viewerVoteResult.error.message}`);
    }
    return { counts: countsResult.data, viewerVote: viewerVoteResult.data };
  }

  async ensureUser(username: string): Promise<void> {
    const result = await this.supabase
      .from("users")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
    if (result.error) throw new Error(`Unable to verify account: ${result.error.message}`);
  }

  async savePuzzleVote(puzzleId: number, username: string, vote: -1 | 0 | 1): Promise<void> {
    const result =
      vote === 0
        ? await this.supabase
            .from("puzzle_votes")
            .delete()
            .eq("puzzle_id", puzzleId)
            .eq("username", username)
        : await this.supabase
            .from("puzzle_votes")
            .upsert({ puzzle_id: puzzleId, username, vote }, { onConflict: "puzzle_id,username" });
    if (result.error) {
      throw new Error(
        `${vote === 0 ? "Unable to remove vote" : "Unable to save vote"}: ${result.error.message}`,
      );
    }
  }

  async commentBelongsToTarget(commentId: number, target: CommunityTarget): Promise<boolean> {
    const result = await this.supabase
      .from("community_comments")
      .select("id")
      .eq("id", commentId)
      .eq("target_type", target.type)
      .eq("target_id", target.id)
      .eq("target_context", target.context)
      .maybeSingle();
    if (result.error) throw new Error(`Unable to validate comment: ${result.error.message}`);
    return Boolean(result.data);
  }

  async saveCommentVote(commentId: number, username: string, vote: -1 | 0 | 1): Promise<void> {
    const result =
      vote === 0
        ? await this.supabase
            .from("community_comment_votes")
            .delete()
            .eq("comment_id", commentId)
            .eq("username", username)
        : await this.supabase
            .from("community_comment_votes")
            .upsert(
              { comment_id: commentId, username, vote },
              { onConflict: "comment_id,username" },
            );
    if (result.error) {
      throw new Error(
        `${vote === 0 ? "Unable to remove comment vote" : "Unable to save comment vote"}: ${result.error.message}`,
      );
    }
  }

  async createComment(
    target: CommunityTarget,
    username: string,
    body: string,
    parentId: number | null,
  ): Promise<void> {
    const commentResult = await this.supabase
      .from("community_comments")
      .insert({
        target_type: target.type,
        target_id: target.id,
        target_context: target.context,
        username,
        parent_id: parentId,
        body,
      })
      .select("id")
      .single();
    if (commentResult.error) {
      const invalidParent = /community_comments_parent_fk/i.test(commentResult.error.message);
      const rateLimited =
        /wait 15 seconds before commenting|at most 5 comments.*every 10 minutes/i.test(
          commentResult.error.message,
        );
      throw new HttpError(
        rateLimited ? 429 : invalidParent ? 400 : 500,
        rateLimited
          ? commentResult.error.message
          : invalidParent
            ? "That reply target no longer exists in this discussion."
            : `Unable to post comment: ${commentResult.error.message}`,
      );
    }
    const commentId = Number(commentResult.data?.id);
    if (!Number.isSafeInteger(commentId) || commentId <= 0) {
      throw new Error("The comment was created without a valid identifier.");
    }
    const authorVoteResult = await this.supabase
      .from("community_comment_votes")
      .upsert({ comment_id: commentId, username, vote: 1 }, { onConflict: "comment_id,username" });
    if (!authorVoteResult.error) return;

    const rollbackResult = await this.supabase
      .from("community_comments")
      .delete()
      .eq("id", commentId)
      .eq("username", username);
    const rollbackSuffix = rollbackResult.error
      ? ` The comment also could not be rolled back: ${rollbackResult.error.message}`
      : "";
    throw new Error(
      `Unable to add the author's upvote: ${authorVoteResult.error.message}${rollbackSuffix}`,
    );
  }
}
