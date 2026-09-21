import "./PuzzleIssues.css";

import { faCheck, faCircleXmark, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  fetchPuzzleIssues,
  type PuzzleIssue,
  type PuzzleIssueCategory,
  type PuzzleIssueStatus,
  setPuzzleIssueStatus,
} from "../../lib/puzzles/puzzleIssues";
import { formatLocalDateTime } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";

const REVIEWER = "seaside_tiramisu";
const categoryLabels: Record<PuzzleIssueCategory, string> = {
  missing_alternate_solution: "Missing alternate solution",
  incorrect_solution: "Incorrect solution",
  other: "Other",
};

export const PuzzleIssuesPage = () => {
  const { isLoading, user } = useAuth();
  const [issues, setIssues] = useState<PuzzleIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const isReviewer = normalizeUsername(user?.username) === REVIEWER;

  useEffect(() => {
    if (isLoading) return;
    if (!isReviewer) {
      setLoading(false);
      return;
    }
    let current = true;
    void fetchPuzzleIssues()
      .then(({ issues: rows }) => {
        if (current) setIssues(rows);
      })
      .catch((loadError) => {
        if (current) {
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load puzzle issues.",
          );
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [isLoading, isReviewer]);

  const sortedIssues = useMemo(
    () =>
      [...issues].sort(
        (left, right) => Number(left.status !== "open") - Number(right.status !== "open"),
      ),
    [issues],
  );
  const openCount = issues.filter((issue) => issue.status === "open").length;

  const updateStatus = async (issue: PuzzleIssue, status: PuzzleIssueStatus) => {
    setUpdatingId(issue.id);
    setError("");
    try {
      const result = await setPuzzleIssueStatus(issue.id, status);
      setIssues((current) => current.map((row) => (row.id === issue.id ? result.issue : row)));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update issue.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (isLoading || loading) return <RouteLoadingFallback />;

  return (
    <main className="page puzzleIssuesPage">
      <Seo title="Puzzle issues" description="Review reported atomic puzzle issues." />
      <section className="panel puzzleIssuesPanel">
        <header className="puzzleIssuesHeader">
          <h1>Puzzle issues</h1>
          {isReviewer ? <span>{openCount} open</span> : null}
        </header>

        {!isReviewer ? <p className="puzzleIssuesAccess">This page is restricted.</p> : null}
        {error ? (
          <p className="puzzleIssuesError" role="alert">
            {error}
          </p>
        ) : null}
        {isReviewer && issues.length === 0 && !error ? (
          <p className="puzzleIssuesEmpty">No puzzle issues have been reported.</p>
        ) : null}

        {isReviewer && sortedIssues.length ? (
          <ol className="puzzleIssuesList">
            {sortedIssues.map((issue) => (
              <li className={`puzzleIssueRow ${issue.status}`} key={issue.id}>
                <div className="puzzleIssueRowTopline">
                  <Link to="/solve/$puzzleId" params={{ puzzleId: String(issue.puzzle_id) }}>
                    Puzzle #{issue.puzzle_id}
                  </Link>
                  <span className={`puzzleIssueStatus ${issue.status}`}>{issue.status}</span>
                </div>
                <strong>{categoryLabels[issue.category]}</strong>
                {issue.details ? <p>{issue.details}</p> : null}
                <div className="puzzleIssueMeta">
                  <span>{issue.reporter_username}</span>
                  <time dateTime={issue.created_at}>{formatLocalDateTime(issue.created_at)}</time>
                </div>
                {issue.status === "open" ? (
                  <div className="puzzleIssueActions">
                    <button
                      type="button"
                      disabled={updatingId === issue.id}
                      onClick={() => void updateStatus(issue, "dismissed")}
                    >
                      <FontAwesomeIcon icon={faCircleXmark} aria-hidden="true" />
                      Dismiss
                    </button>
                    <button
                      type="button"
                      className="primary"
                      disabled={updatingId === issue.id}
                      onClick={() => void updateStatus(issue, "resolved")}
                    >
                      <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                      Resolve
                    </button>
                  </div>
                ) : (
                  <button
                    className="puzzleIssueReopen"
                    type="button"
                    disabled={updatingId === issue.id}
                    onClick={() => void updateStatus(issue, "open")}
                  >
                    <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
                    Reopen
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </main>
  );
};
