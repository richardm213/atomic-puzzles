import "./Comments.css";

import { faArrowUp, faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { CommunityCommentTargetLink } from "../../components/CommunityCommentTargetLink/CommunityCommentTargetLink";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  type CommunityCommentTargetFilter,
  type CommunityHistoryComment,
  fetchSiteCommunityComments,
  type ProfileCommentSort,
} from "../../lib/community/puzzleCommunity";
import { formatLocalDateTime } from "../../utils/formatters";

const pageSize = 25;
const targetFilterOptions: Array<{ value: CommunityCommentTargetFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "puzzle", label: "Puzzles" },
  { value: "match", label: "Matches" },
  { value: "tournament", label: "Tournaments" },
  { value: "profile", label: "Profiles" },
];

export const CommentsPage = () => {
  const { isAuthenticated } = useAuth();
  const [comments, setComments] = useState<CommunityHistoryComment[]>([]);
  const [sort, setSort] = useState<ProfileCommentSort>("recent");
  const [targetFilter, setTargetFilter] = useState<CommunityCommentTargetFilter>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError("");

    void fetchSiteCommunityComments({ page, pageSize, sort, targetFilter })
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
  }, [isAuthenticated, page, sort, targetFilter]);

  const changeSort = (nextSort: ProfileCommentSort): void => {
    setSort(nextSort);
    setPage(1);
  };
  const changeTargetFilter = (nextFilter: CommunityCommentTargetFilter): void => {
    setTargetFilter(nextFilter);
    setPage(1);
  };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (loading && comments.length === 0) return <RouteLoadingFallback />;

  return (
    <div className="page commentsPage">
      <Seo
        title="Community Comments"
        description="See the newest and top-rated Atomic Puzzles community comments."
        path="/comments"
      />
      <section className="panel commentsPanel">
        <header className="commentsHeader">
          <div>
            <span>Community</span>
            <h1>Community Comments</h1>
          </div>
          <div className="commentsControls">
            <div className="commentsControlRow">
              <span>Show</span>
              <div className="commentsSort" role="group" aria-label="Filter comments by type">
                {targetFilterOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={targetFilter === option.value ? "active" : ""}
                    aria-pressed={targetFilter === option.value}
                    disabled={loading}
                    onClick={() => changeTargetFilter(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="commentsControlRow">
              <span>Sort</span>
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
            </div>
          </div>
        </header>

        <div className="commentsSummary">
          <span>
            {total.toLocaleString("en-US")} {total === 1 ? "comment" : "comments"}
          </span>
          <span>{sort === "top" ? "Highest net score first" : "Newest first"}</span>
        </div>

        {error ? <p className="commentsError">{error}</p> : null}
        {!loading && !error && comments.length === 0 ? (
          <div className="commentsEmpty">
            <h2>No comments yet</h2>
            <p>Discussions will appear here as the community joins in.</p>
          </div>
        ) : null}

        {!loading && comments.length ? (
          <ol className="siteCommentList">
            {comments.map((comment) => (
              <li key={comment.id}>
                <article className="siteCommentCard">
                  <div className="siteCommentScore" aria-label={`${comment.upvotes} upvotes`}>
                    <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                    <strong>{comment.upvotes}</strong>
                  </div>
                  <div className="siteCommentContent">
                    <div className="siteCommentMeta">
                      <Link
                        className="siteCommentAuthor"
                        to="/@/$username"
                        params={{ username: comment.username }}
                      >
                        {comment.username}
                      </Link>
                      <span className={`siteCommentTarget ${comment.target_type}`}>
                        <CommunityCommentTargetLink {...comment} />
                      </span>
                      <time dateTime={comment.created_at}>
                        {formatLocalDateTime(comment.created_at)}
                      </time>
                    </div>
                    {comment.content_hidden ? (
                      <p className="siteCommentHidden">
                        <FontAwesomeIcon icon={faLock} aria-hidden="true" />
                        <span>Comment hidden until you attempt this puzzle.</span>
                      </p>
                    ) : (
                      <p className="siteCommentBody">{comment.body}</p>
                    )}
                  </div>
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
