import "./PuzzleCommunity.css";

import {
  faArrowDown,
  faArrowUp,
  faChevronDown,
  faChevronRight,
  faReply,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { VoteValue } from "../../../shared/domain/voting";
import { useAuth } from "../../context/AuthContext";
import {
  communityDiscussionQueryOptions,
  communityQueryKeys,
} from "../../lib/community/communityQueries";
import {
  type CommunityDiscussion as CommunityDiscussionData,
  type CommunityTarget,
  postCommunityComment,
  type PuzzleComment,
  saveCommunityCommentVote,
  savePuzzleVote,
} from "../../lib/community/puzzleCommunity";
import type { UsernameSearchSuggestion } from "../../lib/users/usernameSearch";
import { getErrorMessage } from "../../utils/errors";
import { formatLocalDateTime } from "../../utils/formatters";
import { PlayerLink } from "../PlayerLink/PlayerLink";

const MENTION_SEARCH_DELAY_MS = 180;
const mentionPattern = /(^|[^a-z0-9_-])@([a-z0-9_-]+)/gi;

type ActiveMention = {
  start: number;
  end: number;
  query: string;
};

type CommentSort = "recent" | "top";

const mentionAtCaret = (value: string, caret: number): ActiveMention | null => {
  const prefix = value.slice(0, caret);
  const match = prefix.match(/(?:^|[^a-z0-9_-])@([a-z0-9_-]*)$/i);
  const query = match?.[1];
  if (!query || query.length < 3) return null;
  return {
    start: caret - query.length - 1,
    end: caret,
    query: query.toLowerCase(),
  };
};

const CommentBody = ({ body }: { body: string }) => {
  const parts: Array<string | JSX.Element> = [];
  let lastIndex = 0;
  for (const match of body.matchAll(mentionPattern)) {
    const index = match.index ?? 0;
    const leadingSpace = match[1] ?? "";
    const username = match[2];
    if (!username) continue;
    parts.push(body.slice(lastIndex, index), leadingSpace);
    parts.push(
      <PlayerLink
        className="commentMention"
        key={`${index}-${username}`}
        username={username.toLowerCase()}
      >
        @{username}
      </PlayerLink>,
    );
    lastIndex = index + match[0].length;
  }
  parts.push(body.slice(lastIndex));
  return <p>{parts}</p>;
};

type PuzzleCommunityProps = {
  puzzleId: number | undefined;
  voteTargetId: string;
};

type CommunityDiscussionProps = {
  target: CommunityTarget;
  voteTargetId?: string;
};

const emptyCommunity = (target: CommunityTarget): CommunityDiscussionData => ({
  ...(target.type === "puzzle"
    ? {
        counts: { puzzle_id: Number(target.id), upvotes: 0, downvotes: 0, score: 0 },
        viewerVote: 0 as const,
      }
    : {}),
  comments: [],
});

export const CommunityDiscussion = ({ target, voteTargetId }: CommunityDiscussionProps) => {
  const targetType = target.type;
  const targetId = target.id;
  const targetContext = target.context;
  const { isAuthenticated, login, user } = useAuth();
  const [pendingCommentVotes, setPendingCommentVotes] = useState<Set<number>>(() => new Set());
  const [commentBody, setCommentBody] = useState("");
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [mentionSuggestions, setMentionSuggestions] = useState<UsernameSearchSuggestion[]>([]);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [replyingTo, setReplyingTo] = useState<PuzzleComment | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [commentSort, setCommentSort] = useState<CommentSort>(() =>
    targetType === "tournament" ? "recent" : "top",
  );
  const [actionError, setActionError] = useState("");
  const [voteTarget, setVoteTarget] = useState<HTMLElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const mentionRequestIdRef = useRef(0);
  const queryClient = useQueryClient();
  const currentTarget = useMemo<CommunityTarget>(
    () => ({ type: targetType, id: targetId, context: targetContext ?? "" }),
    [targetContext, targetId, targetType],
  );
  const viewerKey = isAuthenticated ? (user?.username ?? "authenticated") : "anonymous";
  const discussionOptions = communityDiscussionQueryOptions(currentTarget, viewerKey);
  const discussionQuery = useQuery({
    ...discussionOptions,
    enabled: Boolean(targetId),
  });
  const community = discussionQuery.data ?? null;
  const loading = discussionQuery.isPending;
  const queryError = discussionQuery.error
    ? getErrorMessage(discussionQuery.error, "Unable to load discussion.")
    : "";
  const error = actionError || queryError;

  const updateDiscussion = (result: CommunityDiscussionData): void => {
    queryClient.setQueryData(discussionOptions.queryKey, result);
  };

  const voteMutation = useMutation({
    mutationFn: ({ puzzleId, vote }: { puzzleId: number; vote: VoteValue }) =>
      savePuzzleVote(puzzleId, vote),
    onSuccess: (result) => {
      updateDiscussion(result);
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.puzzleRankings });
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.users });
    },
  });
  const postCommentMutation = useMutation({
    mutationFn: ({ body, parentId }: { body: string; parentId: number | null }) =>
      postCommunityComment(currentTarget, body, parentId),
    onSuccess: (result) => {
      updateDiscussion(result);
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.siteComments });
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.users });
    },
  });
  const commentVoteMutation = useMutation({
    mutationFn: ({ commentId, vote }: { commentId: number; vote: VoteValue }) =>
      saveCommunityCommentVote(currentTarget, commentId, vote),
    onSuccess: (result) => {
      updateDiscussion(result);
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.siteComments });
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.users });
    },
  });
  const pendingVote = voteMutation.isPending;
  const postingComment = postCommentMutation.isPending;

  useEffect(() => {
    setVoteTarget(voteTargetId ? document.getElementById(voteTargetId) : null);
  }, [voteTargetId]);

  useEffect(() => {
    setCollapsed(new Set());
    setReplyingTo(null);
    setCommentBody("");
    setActiveMention(null);
    setMentionSuggestions([]);
    setActionError("");
    setCommentSort(targetType === "tournament" ? "recent" : "top");
  }, [targetContext, targetId, targetType]);

  useEffect(() => {
    const requestId = mentionRequestIdRef.current + 1;
    mentionRequestIdRef.current = requestId;
    setActiveMentionIndex(0);
    if (!activeMention) {
      setMentionSuggestions([]);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      void import("../../lib/users/usernameSearch")
        .then(({ searchUsernameSuggestions }) => searchUsernameSuggestions(activeMention.query, 6))
        .then((suggestions) => {
          if (requestId !== mentionRequestIdRef.current) return;
          setMentionSuggestions(
            suggestions.filter(
              (suggestion) =>
                suggestion.accountUsername && suggestion.accountUsername !== user?.username,
            ),
          );
        })
        .catch(() => {
          if (requestId === mentionRequestIdRef.current) setMentionSuggestions([]);
        });
    }, MENTION_SEARCH_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [activeMention, user?.username]);

  const updateActiveMention = (value: string, caret: number): void => {
    setActiveMention(mentionAtCaret(value, caret));
  };

  const insertMention = (suggestion: UsernameSearchSuggestion): void => {
    if (!activeMention || !suggestion.accountUsername) return;
    const replacement = `@${suggestion.accountUsername} `;
    const nextBody =
      commentBody.slice(0, activeMention.start) +
      replacement +
      commentBody.slice(activeMention.end);
    const nextCaret = activeMention.start + replacement.length;
    setCommentBody(nextBody);
    setActiveMention(null);
    setMentionSuggestions([]);
    window.requestAnimationFrame(() => {
      commentInputRef.current?.focus();
      commentInputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const childrenByParent = useMemo(() => {
    const children = new Map<number | null, PuzzleComment[]>();
    for (const comment of community?.comments ?? []) {
      const current = children.get(comment.parent_id) ?? [];
      current.push(comment);
      children.set(comment.parent_id, current);
    }
    for (const comments of children.values()) {
      comments.sort((left, right) => {
        const dateDifference =
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
        if (commentSort === "recent") return dateDifference || right.id - left.id;
        return (
          right.score - left.score ||
          right.upvotes - left.upvotes ||
          dateDifference ||
          right.id - left.id
        );
      });
    }
    return children;
  }, [commentSort, community?.comments]);

  useEffect(() => {
    if (!community || !window.location.hash.startsWith("#comment-")) return;
    const targetId = window.location.hash.slice(1);
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [community]);

  useEffect(() => {
    if (!replyingTo) return;
    commentInputRef.current?.focus();
  }, [replyingTo]);

  const requireLogin = (): boolean => {
    if (isAuthenticated) return true;
    void login(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    return false;
  };

  const handleVote = async (vote: -1 | 1) => {
    if (target.type !== "puzzle" || pendingVote) return;
    if (!requireLogin()) return;
    const nextVote = community?.viewerVote === vote ? 0 : vote;
    setActionError("");
    try {
      await voteMutation.mutateAsync({ puzzleId: Number(target.id), vote: nextVote });
    } catch (voteError) {
      setActionError(getErrorMessage(voteError, "Unable to save vote."));
    }
  };

  const handlePostComment = async () => {
    const body = commentBody.trim();
    if (!target.id || !body || postingComment) return;
    if (!requireLogin()) return;
    setActionError("");
    try {
      await postCommentMutation.mutateAsync({ body, parentId: replyingTo?.id ?? null });
      setCommentBody("");
      setReplyingTo(null);
    } catch (commentError) {
      setActionError(getErrorMessage(commentError, "Unable to post comment."));
    }
  };

  const handleCommentVote = async (comment: PuzzleComment, vote: -1 | 1) => {
    if (!target.id || pendingCommentVotes.has(comment.id)) return;
    if (!requireLogin()) return;
    const nextVote = comment.viewer_vote === vote ? 0 : vote;
    setPendingCommentVotes((current) => new Set(current).add(comment.id));
    setActionError("");
    try {
      await commentVoteMutation.mutateAsync({ commentId: comment.id, vote: nextVote });
    } catch (voteError) {
      setActionError(getErrorMessage(voteError, "Unable to save comment vote."));
    } finally {
      setPendingCommentVotes((current) => {
        const next = new Set(current);
        next.delete(comment.id);
        return next;
      });
    }
  };

  const toggleCollapsed = (commentId: number) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const countDescendants = (commentId: number): number => {
    const directReplies = childrenByParent.get(commentId) ?? [];
    return directReplies.reduce((total, reply) => total + 1 + countDescendants(reply.id), 0);
  };

  const renderCommentComposer = (isReply: boolean) => {
    if (!isAuthenticated) {
      return (
        <button className="commentLoginButton" type="button" onClick={() => requireLogin()}>
          Log in with Lichess to comment
        </button>
      );
    }

    return (
      <div className={`puzzleCommentComposer ${isReply ? "replyComposer" : ""}`}>
        {replyingTo ? (
          <div className="commentComposerHeading">
            <strong>{`Replying to ${replyingTo.username}`}</strong>
            <button type="button" onClick={() => setReplyingTo(null)}>
              Cancel reply
            </button>
          </div>
        ) : null}
        <textarea
          id={`${target.type}-comment-input`}
          ref={commentInputRef}
          aria-label={replyingTo ? `Reply to ${replyingTo.username}` : "Add a comment"}
          value={commentBody}
          maxLength={10_000}
          rows={3}
          placeholder={replyingTo ? `Reply to ${replyingTo.username}…` : "Add a comment…"}
          aria-autocomplete="list"
          aria-controls={
            mentionSuggestions.length ? `${target.type}-mention-suggestions` : undefined
          }
          aria-activedescendant={
            mentionSuggestions.length
              ? `${target.type}-mention-suggestion-${activeMentionIndex}`
              : undefined
          }
          onChange={(event) => {
            setCommentBody(event.target.value);
            updateActiveMention(event.target.value, event.target.selectionStart);
          }}
          onClick={(event) =>
            updateActiveMention(event.currentTarget.value, event.currentTarget.selectionStart)
          }
          onKeyUp={(event) => {
            if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return;
            updateActiveMention(event.currentTarget.value, event.currentTarget.selectionStart);
          }}
          onKeyDown={(event) => {
            if (!mentionSuggestions.length) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setActiveMentionIndex((current) =>
                event.key === "ArrowDown"
                  ? (current + 1) % mentionSuggestions.length
                  : (current - 1 + mentionSuggestions.length) % mentionSuggestions.length,
              );
            } else if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              const selectedSuggestion = mentionSuggestions[activeMentionIndex];
              if (selectedSuggestion) insertMention(selectedSuggestion);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setActiveMention(null);
              setMentionSuggestions([]);
            }
          }}
        />
        {mentionSuggestions.length ? (
          <ul
            className="commentMentionSuggestions"
            id={`${target.type}-mention-suggestions`}
            role="listbox"
            aria-label="Matching users"
          >
            {mentionSuggestions.map((suggestion, index) => (
              <li
                id={`${target.type}-mention-suggestion-${index}`}
                key={suggestion.accountUsername}
                role="option"
                aria-selected={index === activeMentionIndex}
              >
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertMention(suggestion)}
                >
                  @{suggestion.accountUsername}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="commentComposerActions">
          <button
            type="button"
            disabled={!commentBody.trim() || postingComment}
            onClick={() => void handlePostComment()}
          >
            {postingComment ? "Posting…" : replyingTo ? "Post reply" : "Post comment"}
          </button>
        </div>
      </div>
    );
  };

  const renderComment = (comment: PuzzleComment, depth: number) => {
    const replies = childrenByParent.get(comment.id) ?? [];
    const isCollapsed = collapsed.has(comment.id);
    const hiddenReplyCount = isCollapsed ? countDescendants(comment.id) : 0;
    return (
      <li className="puzzleComment" key={comment.id} style={{ "--comment-depth": depth } as never}>
        <article
          id={`comment-${comment.id}`}
          className={`puzzleCommentCard ${isCollapsed ? "collapsed" : ""}`}
        >
          {isCollapsed ? (
            <button
              className="collapsedCommentSummary"
              type="button"
              onClick={() => toggleCollapsed(comment.id)}
              aria-label={`Expand comment by ${comment.username}`}
              aria-expanded="false"
            >
              <FontAwesomeIcon icon={faChevronRight} />
              <strong>{comment.username}</strong>
              <span>
                {comment.score} {comment.score === 1 ? "point" : "points"}
              </span>
              <time dateTime={comment.created_at}>{formatLocalDateTime(comment.created_at)}</time>
              {hiddenReplyCount > 0 ? (
                <span className="collapsedCommentReplies">
                  {hiddenReplyCount} {hiddenReplyCount === 1 ? "reply" : "replies"} hidden
                </span>
              ) : null}
            </button>
          ) : (
            <div className="puzzleCommentLayout">
              <div className="commentVoteRail" aria-label={`Score ${comment.score}`}>
                <button
                  className={comment.viewer_vote === 1 ? "active upvote" : "upvote"}
                  type="button"
                  aria-label={`Upvote comment. ${comment.upvotes} upvotes`}
                  aria-pressed={comment.viewer_vote === 1}
                  title={`${comment.upvotes} upvotes`}
                  disabled={pendingCommentVotes.has(comment.id)}
                  onClick={() => void handleCommentVote(comment, 1)}
                >
                  <FontAwesomeIcon icon={faArrowUp} />
                </button>
                <strong>{comment.score}</strong>
                <button
                  className={comment.viewer_vote === -1 ? "active downvote" : "downvote"}
                  type="button"
                  aria-label={`Downvote comment. ${comment.downvotes} downvotes`}
                  aria-pressed={comment.viewer_vote === -1}
                  title={`${comment.downvotes} downvotes`}
                  disabled={pendingCommentVotes.has(comment.id)}
                  onClick={() => void handleCommentVote(comment, -1)}
                >
                  <FontAwesomeIcon icon={faArrowDown} />
                </button>
              </div>
              <div className="puzzleCommentBody">
                <div className="puzzleCommentMeta">
                  <button
                    className="commentCollapseButton"
                    type="button"
                    onClick={() => toggleCollapsed(comment.id)}
                    aria-label={`Collapse comment by ${comment.username}`}
                    aria-expanded="true"
                  >
                    <FontAwesomeIcon icon={faChevronDown} />
                  </button>
                  <strong>{comment.username}</strong>
                  <time dateTime={comment.created_at}>
                    {formatLocalDateTime(comment.created_at)}
                  </time>
                </div>
                <CommentBody body={comment.body} />
                <button
                  className="commentReplyButton"
                  type="button"
                  onClick={() => {
                    if (!requireLogin()) return;
                    setReplyingTo(comment);
                  }}
                >
                  <FontAwesomeIcon icon={faReply} />
                  Reply
                </button>
              </div>
            </div>
          )}
        </article>
        {replyingTo?.id === comment.id ? renderCommentComposer(true) : null}
        {!isCollapsed && replies.length > 0 ? (
          <ol className="puzzleCommentReplies">
            {replies.map((reply) => renderComment(reply, depth + 1))}
          </ol>
        ) : null}
      </li>
    );
  };

  if (!target.id) return null;
  const data = community ?? emptyCommunity(target);
  const rootComments = childrenByParent.get(null) ?? [];
  const puzzleVoteControls =
    target.type === "puzzle" && data.counts ? (
      <div className="puzzleVotePrompt">
        <div className="puzzleVoteControls" aria-label="Vote on this puzzle">
          <button
            type="button"
            className={data.viewerVote === 1 ? "active upvote" : ""}
            aria-label={`Upvote this puzzle. ${data.counts.upvotes} upvotes`}
            aria-pressed={data.viewerVote === 1}
            disabled={pendingVote}
            onClick={() => void handleVote(1)}
            title={`${data.counts.upvotes} upvotes`}
          >
            <FontAwesomeIcon icon={faArrowUp} />
            <strong>{data.counts.upvotes}</strong>
          </button>
          <button
            type="button"
            className={data.viewerVote === -1 ? "active downvote" : ""}
            aria-label={`Downvote this puzzle. ${data.counts.downvotes} downvotes`}
            aria-pressed={data.viewerVote === -1}
            disabled={pendingVote}
            onClick={() => void handleVote(-1)}
            title={`${data.counts.downvotes} downvotes`}
          >
            <FontAwesomeIcon icon={faArrowDown} />
            <strong>{data.counts.downvotes}</strong>
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      {voteTarget && puzzleVoteControls ? createPortal(puzzleVoteControls, voteTarget) : null}
      <section id={`${target.type}-community`} className="puzzleCommunity" aria-label="Comments">
        {!replyingTo ? renderCommentComposer(false) : null}

        {target.type === "tournament" && data.comments.length > 0 ? (
          <div className="puzzleCommentSort">
            <span>Sort by</span>
            <div role="group" aria-label="Sort comments">
              {(["recent", "top"] as const).map((sort) => (
                <button
                  key={sort}
                  type="button"
                  aria-pressed={commentSort === sort}
                  onClick={() => setCommentSort(sort)}
                >
                  {sort === "recent" ? "Recent" : "Top"}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error ? <p className="puzzleCommunityError">{error}</p> : null}
        {loading && !community ? <p className="puzzleCommunityEmpty">Loading discussion…</p> : null}
        {!loading && data.comments.length === 0 ? (
          <p className="puzzleCommunityEmpty">No comments yet.</p>
        ) : null}
        {rootComments.length > 0 ? (
          <ol className="puzzleCommentList">
            {rootComments.map((comment) => renderComment(comment, 0))}
          </ol>
        ) : null}
      </section>
    </>
  );
};

export const PuzzleCommunity = ({ puzzleId, voteTargetId }: PuzzleCommunityProps) =>
  puzzleId ? (
    <CommunityDiscussion
      target={{ type: "puzzle", id: String(puzzleId) }}
      voteTargetId={voteTargetId}
    />
  ) : null;
