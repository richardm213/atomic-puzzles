import type { SupabaseClient } from "@supabase/supabase-js";

import { requireSupabaseRows, requireSupabaseSuccess } from "../../platform/supabase";

type NotificationWithCommentId = {
  comment_id?: number | null;
};

type NotificationCommentPreview = {
  id: number;
  target_type: string;
  target_id: string;
  body: string | null;
  created_at: string;
};

type NotificationPuzzleAttempt = {
  puzzle_id: string | number;
  first_attempt_at: string;
  grading_available_at: string | null;
};

export const attachAttemptedPuzzleCommentBodies = <T extends NotificationWithCommentId>(
  notifications: T[],
  comments: NotificationCommentPreview[],
  attempts: NotificationPuzzleAttempt[],
  activePuzzleIds: Set<string> = new Set(),
): Array<T & { comment_body: string | null }> => {
  const commentsById = new Map(comments.map((comment) => [Number(comment.id), comment]));
  const firstAttemptByPuzzleId = new Map(
    attempts.map((attempt) => [String(attempt.puzzle_id), attempt]),
  );

  const now = Date.now();
  return notifications.map((notification) => {
    const comment = commentsById.get(Number(notification.comment_id));
    const firstAttempt = comment
      ? firstAttemptByPuzzleId.get(String(comment.target_id))
      : undefined;
    const attemptedAt = Date.parse(firstAttempt?.first_attempt_at ?? "");
    const gradingAvailableAt = Date.parse(firstAttempt?.grading_available_at ?? "");
    const canShowBody =
      comment?.target_type === "puzzle" &&
      !activePuzzleIds.has(String(comment.target_id)) &&
      gradingAvailableAt > now &&
      attemptedAt <= Date.parse(comment.created_at);
    return {
      ...notification,
      comment_body: canShowBody ? String(comment.body ?? "") : null,
    };
  });
};

export class NotificationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async countUnread(username: string): Promise<number> {
    const { count, error } = await this.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_username", username)
      .is("read_at", null);
    if (error) throw new Error(`Unable to count notifications: ${error.message}`);
    return count ?? 0;
  }

  async markRead(username: string, ids: number[]): Promise<void> {
    let query = this.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_username", username)
      .is("read_at", null);
    if (ids.length > 0) query = query.in("id", ids);
    const { error } = await query;
    requireSupabaseSuccess({ error }, "Unable to mark notifications read");
  }

  async delete(username: string, ids: number[]): Promise<void> {
    const { error } = await this.supabase
      .from("notifications")
      .delete()
      .eq("recipient_username", username)
      .in("id", ids);
    requireSupabaseSuccess({ error }, "Unable to delete notifications");
  }

  async list(username: string) {
    const { data, error } = await this.supabase
      .from("notifications")
      .select(
        "id, recipient_username, actor_username, notification_type, puzzle_id, comment_id, rating, rating_deviation, shop_item_key, redemption_id, coin_amount, coin_message, coin_transfer_id, coin_request_id, ranking_period, ranking_mode, ranking_position, feature_key, feature_message, feature_path, created_at, read_at",
      )
      .eq("recipient_username", username)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100);
    const notifications = requireSupabaseRows({ data, error }, "Unable to load notifications");
    const commentIds = [
      ...new Set(
        notifications
          .map((notification) => Number(notification.comment_id))
          .filter((commentId) => Number.isSafeInteger(commentId) && commentId > 0),
      ),
    ];
    if (!commentIds.length) {
      return attachAttemptedPuzzleCommentBodies(notifications, [], []);
    }

    const commentsResult = await this.supabase
      .from("community_comments")
      .select("id, target_type, target_id, body, created_at")
      .in("id", commentIds);
    const comments = requireSupabaseRows(commentsResult, "Unable to load notification comments");
    const puzzleIds = [
      ...new Set(
        comments
          .filter((comment) => comment.target_type === "puzzle")
          .map((comment) => String(comment.target_id)),
      ),
    ];
    if (!puzzleIds.length) {
      return attachAttemptedPuzzleCommentBodies(notifications, comments, []);
    }

    const [attemptsResult, runsResult] = await Promise.all([
      this.supabase
        .from("puzzle_progress")
        .select("puzzle_id, first_attempt_at, grading_available_at")
        .eq("username", username)
        .in("puzzle_id", puzzleIds),
      this.supabase
        .from("puzzle_runs")
        .select("puzzle_id")
        .eq("username", username)
        .in("puzzle_id", puzzleIds.map(Number))
        .is("ended_at", null),
    ]);
    const attempts = requireSupabaseRows(attemptsResult, "Unable to check puzzle attempts");
    const activeRuns = requireSupabaseRows(runsResult, "Unable to check active puzzle runs");
    return attachAttemptedPuzzleCommentBodies(
      notifications,
      comments,
      attempts,
      new Set(activeRuns.map((run) => String(run.puzzle_id))),
    );
  }
}
