import { createClient } from "@supabase/supabase-js";

import { parseBearerToken, verifyLichessAccount } from "../lib/lichessAccount";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type CommunityBody = {
  action?: unknown;
  puzzleId?: unknown;
  username?: unknown;
  page?: unknown;
  pageSize?: unknown;
  sort?: unknown;
  vote?: unknown;
  commentId?: unknown;
  parentId?: unknown;
  body?: unknown;
};

const MAX_COMMENT_LENGTH = 10_000;

const jsonResponse = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const parseBody = (event: NetlifyEvent): CommunityBody | null => {
  try {
    const parsed = JSON.parse(event.body ?? "");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as CommunityBody)
      : null;
  } catch {
    return null;
  }
};

const readPositiveInteger = (value: unknown): number | null => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

const readProfileUsername = (value: unknown): string =>
  typeof value === "string" && value.trim().length <= 100 ? value.trim().toLowerCase() : "";

export const buildProfileCommentRows = (
  comments: Array<{
    id: number | string;
    puzzle_id: number | string;
    body: string | null;
    created_at: string | null;
  }>,
  commentCounts: Array<{ comment_id: number | string; upvotes: number | string | null }>,
  solvedPuzzles: Array<{ puzzle_id: number | string }>,
) => {
  const upvotesByCommentId = new Map(
    commentCounts.map((row) => [Number(row.comment_id), Number(row.upvotes)]),
  );
  const solvedPuzzleIds = new Set(solvedPuzzles.map((row) => String(row.puzzle_id)));

  return comments.map((comment) => {
    const contentHidden = !solvedPuzzleIds.has(String(comment.puzzle_id));
    return {
      id: Number(comment.id),
      puzzle_id: Number(comment.puzzle_id),
      body: contentHidden ? null : String(comment.body ?? ""),
      created_at: String(comment.created_at ?? ""),
      upvotes: upvotesByCommentId.get(Number(comment.id)) ?? 0,
      content_hidden: contentHidden,
    };
  });
};

type ProfileCommentRecord = {
  id: number | string;
  puzzle_id: number | string;
  body: string | null;
  created_at: string | null;
};

type ProfileCommentCountRecord = {
  comment_id: number | string;
  upvotes: number | string | null;
  score?: number | string | null;
};

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

export const sumCommentKarma = (votes: Array<{ vote: unknown }>): number =>
  votes.reduce((karma, row) => {
    const vote = Number(row.vote);
    return karma + (vote === 1 || vote === -1 ? vote : 0);
  }, 0);

const loadProfileCommentKarma = async (
  supabase: ReturnType<typeof getSupabase>,
  profileUsername: string,
) => {
  const pageSize = 1_000;
  let from = 0;
  let karma = 0;

  while (true) {
    const result = await supabase
      .from("puzzle_comment_votes")
      .select("vote, comment:puzzle_comments!puzzle_comment_votes_comment_fk!inner(username)")
      .eq("comment.username", profileUsername)
      .range(from, from + pageSize - 1);

    if (result.error) {
      throw new Error(`Unable to load comment karma: ${result.error.message}`);
    }

    const votes = result.data ?? [];
    karma += sumCommentKarma(votes);
    if (votes.length < pageSize) break;
    from += pageSize;
  }

  return { karma };
};

const loadProfileComments = async (
  supabase: ReturnType<typeof getSupabase>,
  profileUsername: string,
  viewerUsername: string | null,
  page: number,
  pageSize: number,
  sort: "recent" | "top",
) => {
  const databasePageSize = 1_000;
  const allComments: ProfileCommentRecord[] = [];
  let databaseFrom = 0;

  while (true) {
    const commentsResult = await supabase
      .from("puzzle_comments")
      .select("id, puzzle_id, body, created_at")
      .eq("username", profileUsername)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(databaseFrom, databaseFrom + databasePageSize - 1);

    if (commentsResult.error) {
      throw new Error(`Unable to load comment history: ${commentsResult.error.message}`);
    }

    const rows = commentsResult.data ?? [];
    allComments.push(...rows);
    if (rows.length < databasePageSize) break;
    databaseFrom += databasePageSize;
  }

  const allCommentCounts: ProfileCommentCountRecord[] = [];
  const allCommentIds = allComments.map((comment) => Number(comment.id));
  const countBatchSize = 200;
  for (let index = 0; index < allCommentIds.length; index += countBatchSize) {
    const commentCountsResult = await supabase
      .from("puzzle_comment_vote_counts")
      .select("comment_id, upvotes, score")
      .in("comment_id", allCommentIds.slice(index, index + countBatchSize));

    if (commentCountsResult.error) {
      throw new Error(`Unable to load comment votes: ${commentCountsResult.error.message}`);
    }
    allCommentCounts.push(...(commentCountsResult.data ?? []));
  }

  const from = (page - 1) * pageSize;
  const comments = sortProfileCommentRecords(allComments, allCommentCounts, sort).slice(
    from,
    from + pageSize,
  );
  const puzzleIds = [...new Set(comments.map((comment) => Number(comment.puzzle_id)))];
  const solvedPuzzlesResult =
    viewerUsername && puzzleIds.length
      ? await supabase
          .from("puzzle_progress")
          .select("puzzle_id")
          .eq("username", viewerUsername)
          .eq("puzzle_correct", true)
          .in("puzzle_id", puzzleIds.map(String))
      : { data: [], error: null };

  if (solvedPuzzlesResult.error) {
    throw new Error(`Unable to check solved puzzles: ${solvedPuzzlesResult.error.message}`);
  }

  return {
    comments: buildProfileCommentRows(comments, allCommentCounts, solvedPuzzlesResult.data ?? []),
    total: allComments.length,
    page,
    pageSize,
    sort,
  };
};

const getSupabase = () => {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Puzzle community service is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
};

const loadCommunity = async (
  supabase: ReturnType<typeof getSupabase>,
  puzzleId: number,
  username: string | null,
) => {
  const [
    countsResult,
    commentsResult,
    viewerVoteResult,
    commentCountsResult,
    viewerCommentVotesResult,
  ] = await Promise.all([
    supabase
      .from("puzzle_vote_counts")
      .select("puzzle_id, upvotes, downvotes, score")
      .eq("puzzle_id", puzzleId)
      .maybeSingle(),
    supabase
      .from("puzzle_comments")
      .select("id, puzzle_id, username, parent_id, body, created_at")
      .eq("puzzle_id", puzzleId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    username
      ? supabase
          .from("puzzle_votes")
          .select("vote")
          .eq("puzzle_id", puzzleId)
          .eq("username", username)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("puzzle_comment_vote_counts")
      .select("comment_id, upvotes, downvotes, score")
      .eq("puzzle_id", puzzleId),
    username
      ? supabase
          .from("puzzle_comment_votes")
          .select("comment_id, vote")
          .eq("puzzle_id", puzzleId)
          .eq("username", username)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (countsResult.error) {
    throw new Error(`Unable to load puzzle votes: ${countsResult.error.message}`);
  }
  if (commentsResult.error) {
    throw new Error(`Unable to load puzzle comments: ${commentsResult.error.message}`);
  }
  if (viewerVoteResult.error) {
    throw new Error(`Unable to load your vote: ${viewerVoteResult.error.message}`);
  }
  if (commentCountsResult.error) {
    throw new Error(`Unable to load comment votes: ${commentCountsResult.error.message}`);
  }
  if (viewerCommentVotesResult.error) {
    throw new Error(`Unable to load your comment votes: ${viewerCommentVotesResult.error.message}`);
  }

  const commentCounts = new Map(
    (commentCountsResult.data ?? []).map((row) => [Number(row.comment_id), row]),
  );
  const viewerCommentVotes = new Map(
    (viewerCommentVotesResult.data ?? []).map((row) => [Number(row.comment_id), Number(row.vote)]),
  );
  const comments = (commentsResult.data ?? []).map((comment) => {
    const counts = commentCounts.get(Number(comment.id));
    return {
      ...comment,
      upvotes: Number(counts?.upvotes ?? 0),
      downvotes: Number(counts?.downvotes ?? 0),
      score: Number(counts?.score ?? 0),
      viewer_vote: Number(viewerCommentVotes.get(Number(comment.id)) ?? 0),
    };
  });

  return {
    counts: countsResult.data ?? {
      puzzle_id: puzzleId,
      upvotes: 0,
      downvotes: 0,
      score: 0,
    },
    comments,
    viewerVote: Number(viewerVoteResult.data?.vote ?? 0),
  };
};

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const input = parseBody(event);
  const action = input?.action;
  const isProfileAction = action === "profileComments" || action === "profileKarma";
  const puzzleId = readPositiveInteger(input?.puzzleId);
  const profileUsername = readProfileUsername(input?.username);
  if (
    !input ||
    !["load", "vote", "comment", "commentVote", "profileComments", "profileKarma"].includes(
      String(action),
    ) ||
    (isProfileAction ? !profileUsername : !puzzleId)
  ) {
    return jsonResponse(400, { error: "Invalid puzzle community request." });
  }

  try {
    const accessToken = parseBearerToken(event.headers);
    let username: string | null = null;

    if (accessToken) {
      const account = await verifyLichessAccount(accessToken);
      if (!account?.username) {
        return jsonResponse(401, { error: "Your Lichess login is no longer valid." });
      }
      username = account.username.trim().toLowerCase();
    } else if (action !== "load" && !isProfileAction) {
      return jsonResponse(401, { error: "Log in with Lichess to participate." });
    }

    const supabase = getSupabase();

    if (action === "profileKarma") {
      return jsonResponse(200, await loadProfileCommentKarma(supabase, profileUsername));
    }

    if (action === "profileComments") {
      const page = readPositiveInteger(input.page) ?? 1;
      const requestedPageSize = readPositiveInteger(input.pageSize) ?? 25;
      const pageSize = Math.min(100, requestedPageSize);
      const sort = input.sort === "top" ? "top" : "recent";
      return jsonResponse(
        200,
        await loadProfileComments(supabase, profileUsername, username, page, pageSize, sort),
      );
    }

    if (action === "load") {
      return jsonResponse(200, await loadCommunity(supabase, puzzleId!, username));
    }

    if (!username) {
      return jsonResponse(401, { error: "Log in with Lichess to participate." });
    }

    const { error: userError } = await supabase
      .from("users")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
    if (userError) throw new Error(`Unable to verify account: ${userError.message}`);

    if (action === "vote") {
      const vote = input.vote;
      if (vote !== -1 && vote !== 0 && vote !== 1) {
        return jsonResponse(400, { error: "Vote must be -1, 0, or 1." });
      }

      if (vote === 0) {
        const { error } = await supabase
          .from("puzzle_votes")
          .delete()
          .eq("puzzle_id", puzzleId!)
          .eq("username", username);
        if (error) throw new Error(`Unable to remove vote: ${error.message}`);
      } else {
        const { error } = await supabase
          .from("puzzle_votes")
          .upsert({ puzzle_id: puzzleId!, username, vote }, { onConflict: "puzzle_id,username" });
        if (error) throw new Error(`Unable to save vote: ${error.message}`);
      }

      return jsonResponse(200, await loadCommunity(supabase, puzzleId!, username));
    }

    if (action === "commentVote") {
      const commentId = readPositiveInteger(input.commentId);
      const vote = input.vote;
      if (!commentId || (vote !== -1 && vote !== 0 && vote !== 1)) {
        return jsonResponse(400, { error: "Invalid comment vote." });
      }

      if (vote === 0) {
        const { error } = await supabase
          .from("puzzle_comment_votes")
          .delete()
          .eq("comment_id", commentId)
          .eq("username", username);
        if (error) throw new Error(`Unable to remove comment vote: ${error.message}`);
      } else {
        const { error } = await supabase
          .from("puzzle_comment_votes")
          .upsert(
            { comment_id: commentId, puzzle_id: puzzleId!, username, vote },
            { onConflict: "comment_id,username" },
          );
        if (error) {
          const invalidComment = /puzzle_comment_votes_comment_fk/i.test(error.message);
          return jsonResponse(invalidComment ? 400 : 500, {
            error: invalidComment
              ? "That comment does not belong to this puzzle."
              : `Unable to save comment vote: ${error.message}`,
          });
        }
      }

      return jsonResponse(200, await loadCommunity(supabase, puzzleId!, username));
    }

    const commentBody = typeof input.body === "string" ? input.body.trim() : "";
    if (!commentBody || commentBody.length > MAX_COMMENT_LENGTH) {
      return jsonResponse(400, {
        error: `Comment must be between 1 and ${MAX_COMMENT_LENGTH.toLocaleString()} characters.`,
      });
    }
    const parentId =
      input.parentId === null || input.parentId === undefined
        ? null
        : readPositiveInteger(input.parentId);
    if (input.parentId !== null && input.parentId !== undefined && parentId === null) {
      return jsonResponse(400, { error: "Invalid parent comment." });
    }

    const { error } = await supabase.from("puzzle_comments").insert({
      puzzle_id: puzzleId!,
      username,
      parent_id: parentId,
      body: commentBody,
    });
    if (error) {
      const invalidParent = /puzzle_comments_parent_fk/i.test(error.message);
      const rateLimited =
        /wait 15 seconds before commenting|at most 5 comments.*every 10 minutes/i.test(
          error.message,
        );
      return jsonResponse(rateLimited ? 429 : invalidParent ? 400 : 500, {
        error: rateLimited
          ? error.message
          : invalidParent
            ? "That reply target no longer exists on this puzzle."
            : `Unable to post comment: ${error.message}`,
      });
    }

    return jsonResponse(201, await loadCommunity(supabase, puzzleId!, username));
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to update puzzle community.",
    });
  }
};
