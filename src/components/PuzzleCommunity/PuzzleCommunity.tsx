import "./PuzzleCommunity.css";

import {
  faArrowDown,
  faArrowUp,
  faChevronDown,
  faChevronRight,
  faComment,
  faReply,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../../context/AuthContext";
import {
  type CommunityDiscussion as CommunityDiscussionData,
  type CommunityTarget,
  fetchCommunityDiscussion,
  fetchPuzzleCommunity,
  postCommunityComment,
  type PuzzleComment,
  saveCommunityCommentVote,
  savePuzzleVote,
} from "../../lib/community/puzzleCommunity";
import { formatLocalDateTime } from "../../utils/formatters";

type PuzzleCommunityProps = {
  puzzleId: number | undefined;
  voteTargetId: string;
};

type CommunityDiscussionProps = {
  target: CommunityTarget;
  voteTargetId?: string;
  eyebrow?: string;
  heading?: string;
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

export const CommunityDiscussion = ({
  target,
  voteTargetId,
  eyebrow = "Community",
  heading = "Discussion",
}: CommunityDiscussionProps) => {
  const targetType = target.type;
  const targetId = target.id;
  const targetContext = target.context;
  const { accessToken, getAccessToken, isAuthenticated, login, user } = useAuth();
  const [community, setCommunity] = useState<CommunityDiscussionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingVote, setPendingVote] = useState(false);
  const [pendingCommentVotes, setPendingCommentVotes] = useState<Set<number>>(() => new Set());
  const [commentBody, setCommentBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<PuzzleComment | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState("");
  const [voteTarget, setVoteTarget] = useState<HTMLElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setVoteTarget(voteTargetId ? document.getElementById(voteTargetId) : null);
  }, [voteTargetId]);

  useEffect(() => {
    if (!targetId) return;
    const currentTarget: CommunityTarget = {
      type: targetType,
      id: targetId,
      context: targetContext ?? "",
    };
    let current = true;
    setLoading(true);
    setError("");
    setCollapsed(new Set());
    setReplyingTo(null);
    setCommentBody("");
    const loadRequest =
      targetType === "puzzle"
        ? fetchPuzzleCommunity(Number(targetId), accessToken)
        : fetchCommunityDiscussion(currentTarget, accessToken);
    void loadRequest
      .then((result) => {
        if (current) setCommunity(result);
      })
      .catch((loadError) => {
        if (!current) return;
        setCommunity(emptyCommunity(currentTarget));
        setError(loadError instanceof Error ? loadError.message : "Unable to load discussion.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [accessToken, targetContext, targetId, targetType]);

  const childrenByParent = useMemo(() => {
    const children = new Map<number | null, PuzzleComment[]>();
    for (const comment of community?.comments ?? []) {
      const current = children.get(comment.parent_id) ?? [];
      current.push(comment);
      children.set(comment.parent_id, current);
    }
    for (const comments of children.values()) {
      comments.sort(
        (left, right) =>
          right.upvotes - left.upvotes ||
          right.score - left.score ||
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime() ||
          left.id - right.id,
      );
    }
    return children;
  }, [community?.comments]);

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

  const requireLogin = (): string => {
    const currentAccessToken = getAccessToken();
    if (isAuthenticated && currentAccessToken) return currentAccessToken;
    void login(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    return "";
  };

  const handleVote = async (vote: -1 | 1) => {
    if (target.type !== "puzzle" || pendingVote) return;
    const currentAccessToken = requireLogin();
    if (!currentAccessToken) return;
    const nextVote = community?.viewerVote === vote ? 0 : vote;
    setPendingVote(true);
    setError("");
    try {
      setCommunity(await savePuzzleVote(Number(target.id), nextVote, currentAccessToken));
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "Unable to save vote.");
    } finally {
      setPendingVote(false);
    }
  };

  const handlePostComment = async () => {
    const body = commentBody.trim();
    if (!target.id || !body || postingComment) return;
    const currentAccessToken = requireLogin();
    if (!currentAccessToken) return;
    setPostingComment(true);
    setError("");
    try {
      setCommunity(
        await postCommunityComment(target, body, replyingTo?.id ?? null, currentAccessToken),
      );
      setCommentBody("");
      setReplyingTo(null);
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : "Unable to post comment.");
    } finally {
      setPostingComment(false);
    }
  };

  const handleCommentVote = async (comment: PuzzleComment, vote: -1 | 1) => {
    if (!target.id || pendingCommentVotes.has(comment.id)) return;
    const currentAccessToken = requireLogin();
    if (!currentAccessToken) return;
    const nextVote = comment.viewer_vote === vote ? 0 : vote;
    setPendingCommentVotes((current) => new Set(current).add(comment.id));
    setError("");
    try {
      setCommunity(await saveCommunityCommentVote(target, comment.id, nextVote, currentAccessToken));
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "Unable to save comment vote.");
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

  const renderCommentComposer = (isReply: boolean) => (
    <div className={`puzzleCommentComposer ${isReply ? "replyComposer" : ""}`}>
      <div className="commentComposerHeading">
        <FontAwesomeIcon icon={isReply ? faReply : faComment} />
        <strong>{replyingTo ? `Replying to ${replyingTo.username}` : "Join the discussion"}</strong>
        {replyingTo ? (
          <button type="button" onClick={() => setReplyingTo(null)}>
            Cancel reply
          </button>
        ) : null}
      </div>
      {isAuthenticated ? (
        <>
          <textarea
            id={`${target.type}-comment-input`}
            ref={commentInputRef}
            aria-label={replyingTo ? `Reply to ${replyingTo.username}` : "Add a comment"}
            value={commentBody}
            maxLength={10_000}
            rows={3}
            placeholder={replyingTo ? `Reply to ${replyingTo.username}…` : "Add a comment…"}
            onChange={(event) => setCommentBody(event.target.value)}
          />
          <div className="commentComposerActions">
            <span>Posting as {user?.username}</span>
            <button
              type="button"
              disabled={!commentBody.trim() || postingComment}
              onClick={() => void handlePostComment()}
            >
              {postingComment ? "Posting…" : replyingTo ? "Post reply" : "Post comment"}
            </button>
          </div>
        </>
      ) : (
        <button className="commentLoginButton" type="button" onClick={() => requireLogin()}>
          Log in with Lichess to comment
        </button>
      )}
    </div>
  );

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
                <p>{comment.body}</p>
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

  const headingId = `${target.type}-community-heading`;

  return (
    <>
      {voteTarget && puzzleVoteControls ? createPortal(puzzleVoteControls, voteTarget) : null}
      <section className="puzzleCommunity" aria-labelledby={headingId}>
        <div className="puzzleCommunityHeader">
          <div>
            <span>{eyebrow}</span>
            <h2 id={headingId}>{heading}</h2>
          </div>
        </div>

        {!replyingTo ? renderCommentComposer(false) : null}

        {error ? <p className="puzzleCommunityError">{error}</p> : null}
        {loading && !community ? <p className="puzzleCommunityEmpty">Loading discussion…</p> : null}
        {!loading && data.comments.length === 0 ? (
          <p className="puzzleCommunityEmpty">No comments yet. Start the conversation.</p>
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
