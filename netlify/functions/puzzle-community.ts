import { createClient } from "@supabase/supabase-js";

import { parseBearerToken, verifyCachedLichessAccount } from "../lib/lichessAccount";

type NetlifyEvent = {
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
};

type CommunityBody = {
  action?: unknown;
  puzzleId?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  targetContext?: unknown;
  targetFilter?: unknown;
  username?: unknown;
  page?: unknown;
  pageSize?: unknown;
  sort?: unknown;
  vote?: unknown;
  commentId?: unknown;
  parentId?: unknown;
  body?: unknown;
};

type CommunityTarget = {
  type: "puzzle" | "profile" | "match";
  id: string;
  context: string;
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

const readCommunityTarget = (input: CommunityBody): CommunityTarget | null => {
  const targetType = input.targetType ?? (input.puzzleId !== undefined ? "puzzle" : null);
  const rawTargetId = input.targetId ?? input.puzzleId;

  if (targetType === "puzzle") {
    const puzzleId = readPositiveInteger(rawTargetId);
    return puzzleId ? { type: "puzzle", id: String(puzzleId), context: "" } : null;
  }

  if (targetType === "profile") {
    const username = readProfileUsername(rawTargetId);
    return username ? { type: "profile", id: username, context: "" } : null;
  }

  if (targetType === "match") {
    const id = typeof rawTargetId === "string" ? rawTargetId.trim() : "";
    const context =
      typeof input.targetContext === "string" ? input.targetContext.trim().toLowerCase() : "";
    return id && id.length <= 255 && context && context.length <= 50
      ? { type: "match", id, context }
      : null;
  }

  return null;
};

export const isPublicCommunityReadAction = (action: unknown): boolean =>
  ["load", "loadDiscussion", "profileComments", "profileKarma", "siteComments"].includes(
    String(action),
  );

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

type ProfileCommentRecord = {
  id: number | string;
  target_type: CommunityTarget["type"];
  target_id: string;
  target_context: string;
  username?: string | null;
  body: string | null;
  created_at: string | null;
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

const getSupabase = () => {
  const supabaseUrl =
    process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Community service is not configured.");
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
};

const resolveCanonicalCommunityTarget = async (
  supabase: ReturnType<typeof getSupabase>,
  target: CommunityTarget,
): Promise<CommunityTarget> => {
  if (target.type !== "profile") return target;

  const aliasResult = await supabase
    .from("aliases2")
    .select("username")
    .eq("alias", target.id)
    .limit(1)
    .maybeSingle();

  if (aliasResult.error) {
    throw new Error(`Unable to resolve profile aliases: ${aliasResult.error.message}`);
  }

  const canonicalUsername = readProfileUsername(aliasResult.data?.username);
  return canonicalUsername ? { ...target, id: canonicalUsername } : target;
};

const loadProfileCommentKarma = async (
  supabase: ReturnType<typeof getSupabase>,
  profileUsername: string,
) => {
  const pageSize = 1_000;
  let from = 0;
  let karma = 0;

  while (true) {
    const result = await supabase
      .from("community_comment_votes")
      .select("vote, comment:community_comments!community_comment_votes_comment_fk!inner(username)")
      .eq("comment.username", profileUsername)
      .range(from, from + pageSize - 1);

    if (result.error) throw new Error(`Unable to load comment karma: ${result.error.message}`);
    const votes = result.data ?? [];
    karma += sumCommentKarma(votes);
    if (votes.length < pageSize) break;
    from += pageSize;
  }

  return { karma };
};

const loadProfileComments = async (
  supabase: ReturnType<typeof getSupabase>,
  profileUsername: string | null,
  viewerUsername: string | null,
  page: number,
  pageSize: number,
  sort: "recent" | "top",
  targetFilter: CommunityTarget["type"] | null = null,
) => {
  const databasePageSize = 1_000;
  const allComments: ProfileCommentRecord[] = [];
  let databaseFrom = 0;

  while (true) {
    let commentsQuery = supabase
      .from("community_comments")
      .select("id, target_type, target_id, target_context, username, body, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (profileUsername) commentsQuery = commentsQuery.eq("username", profileUsername);
    if (targetFilter) commentsQuery = commentsQuery.eq("target_type", targetFilter);
    const commentsResult = await commentsQuery.range(
      databaseFrom,
      databaseFrom + databasePageSize - 1,
    );

    if (commentsResult.error) {
      throw new Error(`Unable to load comment history: ${commentsResult.error.message}`);
    }

    const rows = (commentsResult.data ?? []).map((row) => ({
      id: row.id,
      target_type: row.target_type as CommunityTarget["type"],
      target_id: String(row.target_id),
      target_context: String(row.target_context),
      username: row.username,
      body: row.body,
      created_at: row.created_at,
    }));
    allComments.push(...rows);
    if (rows.length < databasePageSize) break;
    databaseFrom += databasePageSize;
  }

  const allCommentCounts: ProfileCommentCountRecord[] = [];
  const allCommentIds = allComments.map((comment) => Number(comment.id));
  const countBatchSize = 200;
  for (let index = 0; index < allCommentIds.length; index += countBatchSize) {
    const commentCountsResult = await supabase
      .from("community_comment_vote_counts")
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
  const puzzleIds = [
    ...new Set(
      comments
        .filter((comment) => comment.target_type === "puzzle")
        .map((comment) => Number(comment.target_id)),
    ),
  ];
  const attemptedPuzzlesResult =
    viewerUsername && puzzleIds.length
      ? await supabase
          .from("puzzle_progress")
          .select("puzzle_id")
          .eq("username", viewerUsername)
          .in("puzzle_id", puzzleIds.map(String))
      : { data: [], error: null };

  if (attemptedPuzzlesResult.error) {
    throw new Error(`Unable to check attempted puzzles: ${attemptedPuzzlesResult.error.message}`);
  }

  return {
    comments: buildCommunityHistoryRows(
      comments,
      allCommentCounts,
      attemptedPuzzlesResult.data ?? [],
    ),
    total: allComments.length,
    page,
    pageSize,
    sort,
  };
};

const applyTargetFilters = <Query extends { eq: (column: string, value: string) => Query }>(
  query: Query,
  target: CommunityTarget,
): Query =>
  query
    .eq("target_type", target.type)
    .eq("target_id", target.id)
    .eq("target_context", target.context);

const loadDiscussion = async (
  supabase: ReturnType<typeof getSupabase>,
  target: CommunityTarget,
  username: string | null,
) => {
  const commentsQuery = applyTargetFilters(
    supabase
      .from("community_comments")
      .select("id, target_type, target_id, target_context, username, parent_id, body, created_at"),
    target,
  )
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  const countsQuery = applyTargetFilters(
    supabase.from("community_comment_vote_counts").select("comment_id, upvotes, downvotes, score"),
    target,
  );
  const [commentsResult, commentCountsResult] = await Promise.all([commentsQuery, countsQuery]);

  if (commentsResult.error) {
    throw new Error(`Unable to load comments: ${commentsResult.error.message}`);
  }
  if (commentCountsResult.error) {
    throw new Error(`Unable to load comment votes: ${commentCountsResult.error.message}`);
  }

  const commentIds = (commentsResult.data ?? []).map((comment) => Number(comment.id));
  const viewerCommentVotesResult =
    username && commentIds.length
      ? await supabase
          .from("community_comment_votes")
          .select("comment_id, vote")
          .eq("username", username)
          .in("comment_id", commentIds)
      : { data: [], error: null };

  if (viewerCommentVotesResult.error) {
    throw new Error(`Unable to load your comment votes: ${viewerCommentVotesResult.error.message}`);
  }

  const commentCounts = new Map(
    (commentCountsResult.data ?? []).map((row) => [Number(row.comment_id), row]),
  );
  const viewerCommentVotes = new Map(
    (viewerCommentVotesResult.data ?? []).map((row) => [Number(row.comment_id), Number(row.vote)]),
  );

  return {
    comments: (commentsResult.data ?? []).map((comment) => {
      const counts = commentCounts.get(Number(comment.id));
      return {
        ...comment,
        upvotes: Number(counts?.upvotes ?? 0),
        downvotes: Number(counts?.downvotes ?? 0),
        score: Number(counts?.score ?? 0),
        viewer_vote: Number(viewerCommentVotes.get(Number(comment.id)) ?? 0),
      };
    }),
  };
};

const loadTargetCommunity = async (
  supabase: ReturnType<typeof getSupabase>,
  target: CommunityTarget,
  username: string | null,
) => {
  const discussion = await loadDiscussion(supabase, target, username);
  if (target.type !== "puzzle") return discussion;

  const puzzleId = Number(target.id);
  const [countsResult, viewerVoteResult] = await Promise.all([
    supabase
      .from("puzzle_vote_counts")
      .select("puzzle_id, upvotes, downvotes, score")
      .eq("puzzle_id", puzzleId)
      .maybeSingle(),
    username
      ? supabase
          .from("puzzle_votes")
          .select("vote")
          .eq("puzzle_id", puzzleId)
          .eq("username", username)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (countsResult.error)
    throw new Error(`Unable to load puzzle votes: ${countsResult.error.message}`);
  if (viewerVoteResult.error)
    throw new Error(`Unable to load your vote: ${viewerVoteResult.error.message}`);

  return {
    ...discussion,
    counts: countsResult.data ?? { puzzle_id: puzzleId, upvotes: 0, downvotes: 0, score: 0 },
    viewerVote: Number(viewerVoteResult.data?.vote ?? 0),
  };
};

const commentBelongsToTarget = async (
  supabase: ReturnType<typeof getSupabase>,
  commentId: number,
  target: CommunityTarget,
): Promise<boolean> => {
  const result = await applyTargetFilters(
    supabase.from("community_comments").select("id").eq("id", commentId),
    target,
  ).maybeSingle();
  if (result.error) throw new Error(`Unable to validate comment: ${result.error.message}`);
  return Boolean(result.data);
};

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== "POST") return jsonResponse(405, { error: "Method not allowed." });

  const input = parseBody(event);
  const action = input?.action;
  const isProfileAction = action === "profileComments" || action === "profileKarma";
  const isDiscussionAction = ["load", "loadDiscussion", "comment", "commentVote"].includes(
    String(action),
  );
  const isPublicReadAction = isPublicCommunityReadAction(action);
  const profileUsername = readProfileUsername(input?.username);
  let target = input && isDiscussionAction ? readCommunityTarget(input) : null;

  if (
    !input ||
    ![
      "load",
      "loadDiscussion",
      "vote",
      "comment",
      "commentVote",
      "profileComments",
      "profileKarma",
      "siteComments",
    ].includes(String(action)) ||
    (isProfileAction && !profileUsername) ||
    (isDiscussionAction && !target) ||
    (action === "vote" && !readPositiveInteger(input.puzzleId))
  ) {
    return jsonResponse(400, { error: "Invalid community request." });
  }

  try {
    const accessToken = parseBearerToken(event.headers);
    let username: string | null = null;

    if (accessToken) {
      try {
        const account = await verifyCachedLichessAccount(accessToken);
        if (account?.username) username = account.username.trim().toLowerCase();
        else if (!isPublicReadAction) {
          return jsonResponse(401, { error: "Your Lichess login is no longer valid." });
        }
      } catch (verificationError) {
        if (!isPublicReadAction) throw verificationError;
      }
    } else if (!isPublicReadAction) {
      return jsonResponse(401, { error: "Log in with Lichess to participate." });
    }

    const supabase = getSupabase();
    if (target) target = await resolveCanonicalCommunityTarget(supabase, target);

    if (action === "profileKarma") {
      return jsonResponse(200, await loadProfileCommentKarma(supabase, profileUsername));
    }

    if (action === "profileComments" || action === "siteComments") {
      const page = readPositiveInteger(input.page) ?? 1;
      const pageSize = Math.min(100, readPositiveInteger(input.pageSize) ?? 25);
      const sort = input.sort === "top" ? "top" : "recent";
      const targetFilter = ["puzzle", "profile", "match"].includes(String(input.targetFilter))
        ? (input.targetFilter as CommunityTarget["type"])
        : null;
      if (
        action === "siteComments" &&
        input.targetFilter !== undefined &&
        input.targetFilter !== "all" &&
        !targetFilter
      ) {
        return jsonResponse(400, { error: "Invalid comment target filter." });
      }
      return jsonResponse(
        200,
        await loadProfileComments(
          supabase,
          action === "profileComments" ? profileUsername : null,
          username,
          page,
          pageSize,
          sort,
          action === "siteComments" ? targetFilter : null,
        ),
      );
    }

    if (action === "load" || action === "loadDiscussion") {
      return jsonResponse(200, await loadTargetCommunity(supabase, target!, username));
    }

    if (!username) return jsonResponse(401, { error: "Log in with Lichess to participate." });

    const { error: userError } = await supabase
      .from("users")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
    if (userError) throw new Error(`Unable to verify account: ${userError.message}`);

    if (action === "vote") {
      const puzzleId = readPositiveInteger(input.puzzleId)!;
      const vote = input.vote;
      if (vote !== -1 && vote !== 0 && vote !== 1) {
        return jsonResponse(400, { error: "Vote must be -1, 0, or 1." });
      }

      if (vote === 0) {
        const { error } = await supabase
          .from("puzzle_votes")
          .delete()
          .eq("puzzle_id", puzzleId)
          .eq("username", username);
        if (error) throw new Error(`Unable to remove vote: ${error.message}`);
      } else {
        const { error } = await supabase
          .from("puzzle_votes")
          .upsert({ puzzle_id: puzzleId, username, vote }, { onConflict: "puzzle_id,username" });
        if (error) throw new Error(`Unable to save vote: ${error.message}`);
      }

      return jsonResponse(
        200,
        await loadTargetCommunity(
          supabase,
          { type: "puzzle", id: String(puzzleId), context: "" },
          username,
        ),
      );
    }

    if (action === "commentVote") {
      const commentId = readPositiveInteger(input.commentId);
      const vote = input.vote;
      if (!commentId || (vote !== -1 && vote !== 0 && vote !== 1)) {
        return jsonResponse(400, { error: "Invalid comment vote." });
      }
      if (!(await commentBelongsToTarget(supabase, commentId, target!))) {
        return jsonResponse(400, { error: "That comment does not belong to this discussion." });
      }

      if (vote === 0) {
        const { error } = await supabase
          .from("community_comment_votes")
          .delete()
          .eq("comment_id", commentId)
          .eq("username", username);
        if (error) throw new Error(`Unable to remove comment vote: ${error.message}`);
      } else {
        const { error } = await supabase
          .from("community_comment_votes")
          .upsert({ comment_id: commentId, username, vote }, { onConflict: "comment_id,username" });
        if (error) throw new Error(`Unable to save comment vote: ${error.message}`);
      }

      return jsonResponse(200, await loadTargetCommunity(supabase, target!, username));
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

    const commentResult = await supabase
      .from("community_comments")
      .insert({
        target_type: target!.type,
        target_id: target!.id,
        target_context: target!.context,
        username,
        parent_id: parentId,
        body: commentBody,
      })
      .select("id")
      .single();
    if (commentResult.error) {
      const invalidParent = /community_comments_parent_fk/i.test(commentResult.error.message);
      const rateLimited =
        /wait 15 seconds before commenting|at most 5 comments.*every 10 minutes/i.test(
          commentResult.error.message,
        );
      return jsonResponse(rateLimited ? 429 : invalidParent ? 400 : 500, {
        error: rateLimited
          ? commentResult.error.message
          : invalidParent
            ? "That reply target no longer exists in this discussion."
            : `Unable to post comment: ${commentResult.error.message}`,
      });
    }

    const createdCommentId = readPositiveInteger(commentResult.data?.id);
    if (!createdCommentId) {
      throw new Error("The comment was created without a valid identifier.");
    }

    const { error: authorVoteError } = await supabase.from("community_comment_votes").upsert(
      {
        comment_id: createdCommentId,
        username,
        vote: 1,
      },
      { onConflict: "comment_id,username" },
    );
    if (authorVoteError) {
      const rollbackResult = await supabase
        .from("community_comments")
        .delete()
        .eq("id", createdCommentId)
        .eq("username", username);
      const rollbackSuffix = rollbackResult.error
        ? ` The comment also could not be rolled back: ${rollbackResult.error.message}`
        : "";
      throw new Error(
        `Unable to add the author's upvote: ${authorVoteError.message}${rollbackSuffix}`,
      );
    }

    return jsonResponse(201, await loadTargetCommunity(supabase, target!, username));
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Unable to update community discussion.",
    });
  }
};
