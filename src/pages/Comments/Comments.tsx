import "./Comments.css";

import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  fetchSitePuzzleComments,
  type ProfileCommentSort,
  type ProfilePuzzleComment,
} from "../../lib/community/puzzleCommunity";
import { formatLocalDateTime } from "../../utils/formatters";

const pageSize = 25;

export const CommentsPage = () => {
  const { accessToken } = useAuth();
  const [comments, setComments] = useState<ProfilePuzzleComment[]>([]);
  const [sort, setSort] = useState<ProfileCommentSort>("recent");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");

    void fetchSitePuzzleComments({ page, pageSize, sort, accessToken })
      .then((result) => {
        if (!current) return;
        setComments(result.comments);
        setTotal(result.total);
      })
      .catch((loadError) => {
        if (!current) return;
        setComments([]);
        setTotal(0);
        setError(loadError instanceof Error ? loadError.message : "Unable to load comments.");
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    return () => {
      current = false;
    };
  }, [accessToken, page, sort]);

  const changeSort = (nextSort: ProfileCommentSort): void => {
    setSort(nextSort);
    setPage(1);
  };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="page commentsPage">
      <Seo
        title="Puzzle Comments"
        description="See the newest and top-rated Atomic Puzzles community comments."
        path="/comments"
      />
      <section className="panel commentsPanel">
        <header className="commentsHeader">
          <div>
            <span>Community</span>
            <h1>Comments</h1>
          </div>
          <div className="commentsSort" role="group" aria-label="Sort comments">
            <button
              type="button"
              className={sort === "recent" ? "active" : ""}
              aria-pressed={sort === "recent"}
              disabled={loading}
              onClick={() => changeSort("recent")}
            >
              Recent
            </button>
            <button
              type="button"
              className={sort === "top" ? "active" : ""}
              aria-pressed={sort === "top"}
              disabled={loading}
              onClick={() => changeSort("top")}
            >
              Top
            </button>
          </div>
        </header>

        <div className="commentsSummary">
          <span>{total.toLocaleString("en-US")} comments</span>
          <span>{sort === "top" ? "Highest net score first" : "Newest first"}</span>
        </div>

        {error ? <p className="commentsError">{error}</p> : null}
        {loading ? <p className="commentsStatus">Loading comments…</p> : null}
        {!loading && !error && comments.length === 0 ? (
          <div className="commentsEmpty">
            <h2>No comments yet</h2>
            <p>Puzzle discussion will appear here as the community joins in.</p>
          </div>
        ) : null}

        {!loading && comments.length ? (
          <ol className="siteCommentList">
            {comments.map((comment) => (
              <li key={comment.id}>
                <article className="siteCommentCard">
                  <div className="siteCommentMeta">
                    <Link to="/@/$username" params={{ username: comment.username }}>
                      {comment.username}
                    </Link>
                    <span aria-hidden="true">·</span>
                    <Link to="/solve/$puzzleId" params={{ puzzleId: String(comment.puzzle_id) }}>
                      Puzzle #{comment.puzzle_id}
                    </Link>
                    <time dateTime={comment.created_at}>
                      {formatLocalDateTime(comment.created_at)}
                    </time>
                    <span className="siteCommentUpvotes" aria-label={`${comment.upvotes} upvotes`}>
                      <i className="fa-solid fa-arrow-up" aria-hidden="true" /> {comment.upvotes}
                    </span>
                  </div>
                  {comment.content_hidden ? (
                    <p className="siteCommentHidden">
                      Comment hidden until you attempt this puzzle.
                    </p>
                  ) : (
                    <p className="siteCommentBody">{comment.body}</p>
                  )}
                </article>
              </li>
            ))}
          </ol>
        ) : null}

        {total > pageSize ? (
          <PaginationRow
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            disabled={loading}
            formatLabel={(current, pages) => `Page ${current} / ${pages}`}
          />
        ) : null}
      </section>
    </div>
  );
};
