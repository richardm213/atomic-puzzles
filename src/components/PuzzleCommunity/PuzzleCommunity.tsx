import "./PuzzleCommunity.css";

import {
  faArrowDown,
  faArrowUp,
  faMinus,
  faPlus,
  faReply,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";

import type { VoteValue } from "../../../shared/domain/voting";
import { useAuth } from "../../context/AuthContext";
import { useMinuteClock } from "../../hooks/useMinuteClock";
import { usePersistedState } from "../../hooks/usePersistedState";
import {
  communityDiscussionQueryOptions,
  communityQueryKeys,
} from "../../lib/community/communityQueries";
import {
  type CommunityDiscussion as CommunityDiscussionData,
  type CommunityTarget,
  editCommunityComment,
  postCommunityComment,
  type PuzzleComment,
  saveCommunityCommentVote,
  savePuzzleVote,
} from "../../lib/community/puzzleCommunity";
import type { UsernameSearchSuggestion } from "../../lib/users/usernameSearch";
import { getErrorMessage } from "../../utils/errors";
import { formatCommentAge, formatLocalDateTime } from "../../utils/formatters";
import { CommentMarkdown } from "../CommentMarkdown/CommentMarkdown";

const MENTION_SEARCH_DELAY_MS = 180;
const collapsedCommentsSchema = z.array(z.number().int().positive());

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

type PuzzleCommunityProps = {
  puzzleId: number | undefined;
  voteTargetId: string;
};

type CommunityDiscussionProps = {
  target: CommunityTarget;
  voteTargetId?: string;
  deferUntilVisible?: boolean;
  allowCommentVotes?: boolean;
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

const applyVote = (
  current: Pick<PuzzleComment, "upvotes" | "downvotes" | "score" | "viewer_vote">,
  nextVote: VoteValue,
) => ({
  upvotes: current.upvotes - (current.viewer_vote === 1 ? 1 : 0) + (nextVote === 1 ? 1 : 0),
  downvotes: current.downvotes - (current.viewer_vote === -1 ? 1 : 0) + (nextVote === -1 ? 1 : 0),
  score: current.score - current.viewer_vote + nextVote,
  viewer_vote: nextVote,
});

export const CommunityDiscussion = ({
  target,
  voteTargetId,
  deferUntilVisible = false,
  allowCommentVotes = true,
}: CommunityDiscussionProps) => {
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
  const [editDraft, setEditDraft] = useState<{ id: number; body: string; original: string } | null>(
    null,
  );
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const editCommentId = editDraft?.id;
  const [collapsedIds, setCollapsedIds] = usePersistedState(
    "community:collapsed-comments:v1",
    collapsedCommentsSchema,
    [],
  );
  const collapsed = useMemo(() => new Set(collapsedIds), [collapsedIds]);
  const [overriddenLinkBranches, setOverriddenLinkBranches] = useState<Set<number>>(
    () => new Set(),
  );
  const [commentSort, setCommentSort] = useState<CommentSort>(() =>
    targetType === "tournament" || !allowCommentVotes ? "recent" : "top",
  );
  const [actionError, setActionError] = useState("");
  const [voteTarget, setVoteTarget] = useState<HTMLElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const communityRef = useRef<HTMLElement>(null);
  const mentionRequestIdRef = useRef(0);
  const optimisticCommentIdRef = useRef(-1);
  const [discussionReady, setDiscussionReady] = useState(
    () => !deferUntilVisible || window.location.hash.startsWith("#comment-"),
  );
  const queryClient = useQueryClient();
  const currentTarget = useMemo<CommunityTarget>(
    () => ({ type: targetType, id: targetId, context: targetContext ?? "" }),
    [targetContext, targetId, targetType],
  );
  const viewerKey = isAuthenticated ? (user?.username ?? "authenticated") : "anonymous";
  const discussionOptions = communityDiscussionQueryOptions(currentTarget, viewerKey);
  const discussionQuery = useQuery({
    ...discussionOptions,
    enabled: Boolean(targetId) && discussionReady,
  });
  const community = discussionQuery.data ?? null;
  const commentClock = useMinuteClock(Boolean(community?.comments.length));
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
    onMutate: ({ vote }) => {
      const previous = queryClient.getQueryData<CommunityDiscussionData>(
        discussionOptions.queryKey,
      );
      void queryClient.cancelQueries({ queryKey: discussionOptions.queryKey }, { revert: false });
      queryClient.setQueryData<CommunityDiscussionData>(discussionOptions.queryKey, (current) => {
        if (!current?.counts || current.viewerVote === undefined) return current;
        const next = applyVote({ ...current.counts, viewer_vote: current.viewerVote }, vote);
        return {
          ...current,
          counts: {
            ...current.counts,
            upvotes: next.upvotes,
            downvotes: next.downvotes,
            score: next.score,
          },
          viewerVote: next.viewer_vote,
        };
      });
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) updateDiscussion(context.previous);
      setActionError(getErrorMessage(error, "Unable to save vote."));
    },
    onSuccess: (result) => {
      updateDiscussion(result);
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.puzzleRankings });
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.users });
    },
  });
  const postCommentMutation = useMutation({
    mutationFn: ({
      body,
      parentId,
    }: {
      body: string;
      parentId: number | null;
      optimisticId: number;
    }) => postCommunityComment(currentTarget, body, parentId),
    onMutate: ({ body, parentId, optimisticId }) => {
      const previous = queryClient.getQueryData<CommunityDiscussionData>(
        discussionOptions.queryKey,
      );
      void queryClient.cancelQueries({ queryKey: discussionOptions.queryKey }, { revert: false });
      queryClient.setQueryData<CommunityDiscussionData>(discussionOptions.queryKey, (current) => ({
        ...(current ?? emptyCommunity(currentTarget)),
        comments: [
          ...(current?.comments ?? []),
          {
            id: optimisticId,
            ...(targetType === "puzzle" ? { puzzle_id: Number(targetId) } : {}),
            target_type: targetType,
            target_id: targetId,
            target_context: targetContext ?? "",
            username: user?.username ?? "",
            parent_id: parentId,
            body,
            created_at: new Date().toISOString(),
            upvotes: 1,
            downvotes: 0,
            score: 1,
            viewer_vote: 1,
          },
        ],
      }));
      return { previous };
    },
    onError: (error, variables, context) => {
      if (context?.previous) updateDiscussion(context.previous);
      setCommentBody((current) => current || variables.body);
      setReplyingTo((current) => {
        if (current || variables.parentId === null || !context?.previous) return current;
        return (
          context.previous.comments.find((comment) => comment.id === variables.parentId) ?? null
        );
      });
      setActionError(getErrorMessage(error, "Unable to post comment."));
    },
    onSuccess: (result) => {
      updateDiscussion(result);
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.siteComments });
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.users });
    },
  });
  const commentVoteMutation = useMutation({
    mutationFn: ({ commentId, vote }: { commentId: number; vote: VoteValue }) =>
      saveCommunityCommentVote(currentTarget, commentId, vote),
    onMutate: ({ commentId, vote }) => {
      const previous = queryClient.getQueryData<CommunityDiscussionData>(
        discussionOptions.queryKey,
      );
      void queryClient.cancelQueries({ queryKey: discussionOptions.queryKey }, { revert: false });
      setPendingCommentVotes((current) => new Set(current).add(commentId));
      queryClient.setQueryData<CommunityDiscussionData>(discussionOptions.queryKey, (current) =>
        current
          ? {
              ...current,
              comments: current.comments.map((comment) =>
                comment.id === commentId ? { ...comment, ...applyVote(comment, vote) } : comment,
              ),
            }
          : current,
      );
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) updateDiscussion(context.previous);
      setActionError(getErrorMessage(error, "Unable to save comment vote."));
    },
    onSuccess: (result) => {
      updateDiscussion(result);
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.siteComments });
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.users });
    },
    onSettled: (_result, _error, { commentId }) => {
      setPendingCommentVotes((current) => {
        const next = new Set(current);
        next.delete(commentId);
        return next;
      });
    },
  });
  const closeEditor = (id: number) => {
    setEditDraft((current) => (current?.id === id ? null : current));
    requestAnimationFrame(() => {
      document
        .getElementById(`comment-${id}`)
        ?.querySelector<HTMLButtonElement>(".commentEditButton")
        ?.focus();
    });
  };
  const editCommentMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) =>
      editCommunityComment(currentTarget, id, body),
    onSuccess: ({ id, body }) => {
      queryClient.setQueryData<CommunityDiscussionData>(discussionOptions.queryKey, (current) =>
        current
          ? {
              ...current,
              comments: current.comments.map((comment) =>
                comment.id === id ? { ...comment, body } : comment,
              ),
            }
          : current,
      );
      void queryClient.invalidateQueries({ queryKey: discussionOptions.queryKey });
      void queryClient.invalidateQueries({ queryKey: communityQueryKeys.siteComments });
      closeEditor(id);
    },
  });
  const pendingVote = voteMutation.isPending;
  const postingComment = postCommentMutation.isPending;

  useEffect(() => {
    if (editCommentId !== undefined) editInputRef.current?.focus();
  }, [editCommentId]);

  useEffect(() => {
    if (discussionReady || !deferUntilVisible) return;
    const element = communityRef.current;
    if (!element || !("IntersectionObserver" in window)) {
      setDiscussionReady(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setDiscussionReady(true);
        observer.disconnect();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [deferUntilVisible, discussionReady]);

  useEffect(() => {
    setVoteTarget(voteTargetId ? document.getElementById(voteTargetId) : null);
  }, [voteTargetId]);

  useEffect(() => {
    setOverriddenLinkBranches(new Set());
    setReplyingTo(null);
    setEditDraft(null);
    setCommentBody("");
    setActiveMention(null);
    setMentionSuggestions([]);
    setActionError("");
    setCommentSort(targetType === "tournament" || !allowCommentVotes ? "recent" : "top");
  }, [allowCommentVotes, targetContext, targetId, targetType]);

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

  const commentAnchor =
    typeof window === "undefined" ? undefined : window.location.hash.match(/^#comment-(\d+)$/)?.[1];
  const linkedBranch = useMemo(() => {
    const path = new Set<number>();
    if (!commentAnchor || !community) return path;
    const byId = new Map(community.comments.map((comment) => [comment.id, comment]));
    let comment = byId.get(Number(commentAnchor));
    while (comment && !path.has(comment.id)) {
      path.add(comment.id);
      comment = comment.parent_id === null ? undefined : byId.get(comment.parent_id);
    }
    return path;
  }, [commentAnchor, community]);

  useEffect(() => {
    if (!community || !commentAnchor) return;
    const frameId = window.requestAnimationFrame(() => {
      document.getElementById(`comment-${commentAnchor}`)?.scrollIntoView?.({
        behavior: "smooth",
        block: "center",
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [commentAnchor, community]);

  useEffect(() => {
    if (!replyingTo) return;
    commentInputRef.current?.focus();
  }, [replyingTo]);

  const requireLogin = (): boolean => {
    if (isAuthenticated) return true;
    void login(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    return false;
  };

  const handleVote = (vote: -1 | 1) => {
    if (target.type !== "puzzle" || pendingVote) return;
    if (!requireLogin()) return;
    const nextVote = community?.viewerVote === vote ? 0 : vote;
    setActionError("");
    voteMutation.mutate({ puzzleId: Number(target.id), vote: nextVote });
  };

  const handlePostComment = () => {
    const body = commentBody;
    if (!target.id || !body.trim() || postingComment) return;
    if (!requireLogin()) return;
    setActionError("");
    const replyTarget = replyingTo;
    const optimisticId = optimisticCommentIdRef.current;
    optimisticCommentIdRef.current -= 1;
    setCommentBody("");
    setReplyingTo(null);
    postCommentMutation.mutate({
      body,
      parentId: replyTarget?.id ?? null,
      optimisticId,
    });
  };

  const handleCommentVote = (comment: PuzzleComment, vote: -1 | 1) => {
    if (!target.id || pendingCommentVotes.has(comment.id)) return;
    if (!requireLogin()) return;
    const nextVote = comment.viewer_vote === vote ? 0 : vote;
    setActionError("");
    commentVoteMutation.mutate({ commentId: comment.id, vote: nextVote });
  };

  const toggleCollapsed = (commentId: number, isCollapsed: boolean) => {
    if (linkedBranch.has(commentId)) {
      setOverriddenLinkBranches((current) => new Set(current).add(commentId));
    }
    setCollapsedIds((current) => {
      if (isCollapsed) return current.filter((id) => id !== commentId);
      return current.includes(commentId) ? current : [...current, commentId];
    });
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
          <span className="commentMarkdownHint">Markdown supported</span>
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
    const hasReplies = replies.length > 0;
    const isCollapsed =
      hasReplies &&
      collapsed.has(comment.id) &&
      (!linkedBranch.has(comment.id) || overriddenLinkBranches.has(comment.id));
    const draft = editDraft?.id === comment.id ? editDraft : null;
    const canEdit =
      isAuthenticated &&
      comment.id > 0 &&
      user?.username?.toLowerCase() === comment.username.toLowerCase();
    const contentId = `comment-content-${comment.id}`;
    const repliesId = `comment-replies-${comment.id}`;

    return (
      <li className="puzzleComment" key={comment.id}>
        <article
          id={`comment-${comment.id}`}
          className={`puzzleCommentCard${hasReplies && !isCollapsed ? " branchOpen" : ""}`}
        >
          {hasReplies ? (
            <button
              className="commentBranchToggle"
              type="button"
              aria-label={`${isCollapsed ? "Expand" : "Collapse"} thread by ${comment.username}`}
              aria-controls={`${contentId} ${repliesId}`}
              aria-expanded={!isCollapsed}
              onClick={() => toggleCollapsed(comment.id, isCollapsed)}
            >
              <span className="commentBranchIcon">
                <FontAwesomeIcon icon={isCollapsed ? faPlus : faMinus} aria-hidden="true" />
              </span>
            </button>
          ) : (
            <span className="commentBranchLeaf" aria-hidden="true"></span>
          )}
          <header className="puzzleCommentMeta">
            <strong>{comment.username}</strong>
            <time dateTime={comment.created_at} title={formatLocalDateTime(comment.created_at)}>
              {formatCommentAge(comment.created_at, commentClock)}
            </time>
          </header>
          <div className="puzzleCommentContent" id={contentId} hidden={isCollapsed}>
            {draft && canEdit ? (
              <form
                className="puzzleCommentComposer commentEditComposer"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    draft.body.trim() &&
                    draft.body !== draft.original &&
                    !editCommentMutation.isPending
                  ) {
                    editCommentMutation.mutate(draft);
                  }
                }}
              >
                <textarea
                  ref={editInputRef}
                  aria-label="Edit comment (Markdown)"
                  maxLength={10_000}
                  rows={3}
                  value={draft.body}
                  readOnly={editCommentMutation.isPending}
                  onChange={(event) => setEditDraft({ ...draft, body: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && !editCommentMutation.isPending)
                      closeEditor(draft.id);
                  }}
                />
                {editCommentMutation.error ? (
                  <p className="puzzleCommunityError" role="alert">
                    {getErrorMessage(editCommentMutation.error, "Unable to edit comment.")}
                  </p>
                ) : null}
                <div className="commentComposerActions">
                  <button
                    className="commentEditCancel"
                    type="button"
                    disabled={editCommentMutation.isPending}
                    onClick={() => closeEditor(draft.id)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      !draft.body.trim() ||
                      draft.body === draft.original ||
                      editCommentMutation.isPending
                    }
                  >
                    {editCommentMutation.isPending ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <CommentMarkdown className="puzzleCommentText" body={comment.body} />
                <div className="puzzleCommentActions">
                  {allowCommentVotes ? (
                    <div
                      className="commentVoteGroup"
                      role="group"
                      aria-label={`Score ${comment.score}`}
                    >
                      <button
                        className={comment.viewer_vote === 1 ? "active upvote" : "upvote"}
                        type="button"
                        aria-label={`Upvote comment. ${comment.upvotes} upvotes`}
                        aria-pressed={comment.viewer_vote === 1}
                        title={`${comment.upvotes} upvotes`}
                        disabled={pendingCommentVotes.has(comment.id)}
                        onClick={() => void handleCommentVote(comment, 1)}
                      >
                        <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
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
                        <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
                      </button>
                    </div>
                  ) : null}
                  <button
                    className="commentReplyButton"
                    type="button"
                    onClick={() => {
                      if (!requireLogin()) return;
                      setReplyingTo(comment);
                    }}
                  >
                    <FontAwesomeIcon icon={faReply} aria-hidden="true" />
                    Reply
                  </button>
                  {canEdit ? (
                    <button
                      className="commentEditButton"
                      type="button"
                      disabled={editDraft !== null}
                      onClick={() => {
                        editCommentMutation.reset();
                        setEditDraft({
                          id: comment.id,
                          body: comment.body,
                          original: comment.body,
                        });
                      }}
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
              </>
            )}
            {replyingTo?.id === comment.id ? renderCommentComposer(true) : null}
          </div>
        </article>
        {hasReplies ? (
          <ol
            className={`puzzleCommentReplies${depth >= 6 ? " flatReplies" : ""}`}
            id={repliesId}
            hidden={isCollapsed}
          >
            {!isCollapsed ? replies.map((reply) => renderComment(reply, depth + 1)) : null}
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
      <section
        ref={communityRef}
        id={`${target.type}-community`}
        className="puzzleCommunity"
        aria-label="Comments"
      >
        {!replyingTo ? renderCommentComposer(false) : null}

        {target.type === "tournament" && allowCommentVotes && data.comments.length > 0 ? (
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

        {error ? (
          <p className="puzzleCommunityError" role="alert">
            {error}
          </p>
        ) : null}
        {loading && !community ? <p className="puzzleCommunityEmpty">Loading discussion…</p> : null}
        {!loading && !error && target.type !== "puzzle" && data.comments.length === 0 ? (
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
      deferUntilVisible
    />
  ) : null;
