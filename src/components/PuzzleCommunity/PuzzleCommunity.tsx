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
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../../context/AuthContext";
import {
  fetchPuzzleCommunity,
  postPuzzleComment,
  type PuzzleComment,
  type PuzzleCommunity as PuzzleCommunityData,
  savePuzzleCommentVote,
  savePuzzleVote,
} from "../../lib/community/puzzleCommunity";
import { formatLocalDateTime } from "../../utils/formatters";

type PuzzleCommunityProps = {
  puzzleId: number | undefined;
  voteTargetId: string;
};

const emptyCommunity = (puzzleId: number): PuzzleCommunityData => ({
  counts: { puzzle_id: puzzleId, upvotes: 0, downvotes: 0, score: 0 },
  comments: [],
  viewerVote: 0,
});

export const PuzzleCommunity = ({ puzzleId, voteTargetId }: PuzzleCommunityProps) => {
  const { accessToken, isAuthenticated, login, user } = useAuth();
  const [community, setCommunity] = useState<PuzzleCommunityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingVote, setPendingVote] = useState(false);
  const [pendingCommentVotes, setPendingCommentVotes] = useState<Set<number>>(() => new Set());
  const [commentBody, setCommentBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<PuzzleComment | null>(null);
  const [postingComment, setPostingComment] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(() => new Set());
  const [error, setError] = useState("");
  const [voteTarget, setVoteTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setVoteTarget(document.getElementById(voteTargetId));
  }, [voteTargetId]);

  useEffect(() => {
    if (!puzzleId) return;
    let current = true;
    setLoading(true);
    setError("");
    setCollapsed(new Set());
    setReplyingTo(null);
    setCommentBody("");
    void fetchPuzzleCommunity(puzzleId, accessToken)
      .then((result) => {
        if (current) setCommunity(result);
      })
      .catch((loadError) => {
        if (!current) return;
        setCommunity(emptyCommunity(puzzleId));
        setError(loadError instanceof Error ? loadError.message : "Unable to load discussion.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [accessToken, puzzleId]);

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

  const requireLogin = (): boolean => {
    if (isAuthenticated && accessToken) return true;
    void login(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    return false;
  };

  const handleVote = async (vote: -1 | 1) => {
    if (!puzzleId || pendingVote || !requireLogin()) return;
    const nextVote = community?.viewerVote === vote ? 0 : vote;
    setPendingVote(true);
    setError("");
    try {
      setCommunity(await savePuzzleVote(puzzleId, nextVote, accessToken));
    } catch (voteError) {
      setError(voteError instanceof Error ? voteError.message : "Unable to save vote.");
    } finally {
      setPendingVote(false);
    }
  };

  const handlePostComment = async () => {
    const body = commentBody.trim();
    if (!puzzleId || !body || postingComment || !requireLogin()) return;
    setPostingComment(true);
    setError("");
    try {
      setCommunity(await postPuzzleComment(puzzleId, body, replyingTo?.id ?? null, accessToken));
      setCommentBody("");
      setReplyingTo(null);
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : "Unable to post comment.");
    } finally {
      setPostingComment(false);
    }
  };

  const handleCommentVote = async (comment: PuzzleComment, vote: -1 | 1) => {
    if (!puzzleId || pendingCommentVotes.has(comment.id) || !requireLogin()) return;
    const nextVote = comment.viewer_vote === vote ? 0 : vote;
    setPendingCommentVotes((current) => new Set(current).add(comment.id));
    setError("");
    try {
      setCommunity(await savePuzzleCommentVote(puzzleId, comment.id, nextVote, accessToken));
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
                    document.querySelector<HTMLTextAreaElement>("#puzzle-comment-input")?.focus();
                  }}
                >
                  <FontAwesomeIcon icon={faReply} />
                  Reply
                </button>
              </div>
            </div>
          )}
        </article>
        {!isCollapsed && replies.length > 0 ? (
          <ol className="puzzleCommentReplies">
            {replies.map((reply) => renderComment(reply, depth + 1))}
          </ol>
        ) : null}
      </li>
    );
  };

  if (!puzzleId) return null;
  const data = community ?? emptyCommunity(puzzleId);
  const rootComments = childrenByParent.get(null) ?? [];
  const puzzleVoteControls = (
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
  );

  return (
    <>
      {voteTarget ? createPortal(puzzleVoteControls, voteTarget) : null}
      <section className="puzzleCommunity" aria-labelledby="puzzle-community-heading">
        <div className="puzzleCommunityHeader">
          <div>
            <span>Community</span>
            <h2 id="puzzle-community-heading">Discussion</h2>
          </div>
        </div>

        <div className="puzzleCommentComposer">
          <div className="commentComposerHeading">
            <FontAwesomeIcon icon={faComment} />
            <strong>
              {replyingTo ? `Replying to ${replyingTo.username}` : "Join the discussion"}
            </strong>
            {replyingTo ? (
              <button type="button" onClick={() => setReplyingTo(null)}>
                Cancel reply
              </button>
            ) : null}
          </div>
          {isAuthenticated ? (
            <>
              <textarea
                id="puzzle-comment-input"
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
