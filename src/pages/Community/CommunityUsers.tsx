import "./Community.css";

import { faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import { type CommunityUserStats, fetchCommunityUsers } from "../../lib/community/puzzleCommunity";

type SortKey = keyof CommunityUserStats;

const columns: Array<{ key: SortKey; label: string; shortLabel?: string }> = [
  { key: "username", label: "Player" },
  { key: "puzzles_upvoted", label: "Upvoted", shortLabel: "Puzzle upvotes" },
  { key: "puzzles_downvoted", label: "Downvoted", shortLabel: "Puzzle downvotes" },
  { key: "comment_karma", label: "Karma", shortLabel: "Comment karma" },
  { key: "comments_left", label: "Comments", shortLabel: "Comments left" },
];

export const CommunityUsersPage = () => {
  const [users, setUsers] = useState<CommunityUserStats[]>([]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("comments_left");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    void fetchCommunityUsers()
      .then((result) => {
        if (current) setUsers(result);
      })
      .catch((loadError) => {
        if (current) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load users.");
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  const visibleUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? users.filter((user) => user.username.includes(normalizedQuery))
      : users;
    const multiplier = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((left, right) => {
      if (sortKey === "username") {
        return multiplier * left.username.localeCompare(right.username);
      }
      return (
        multiplier * (left[sortKey] - right[sortKey]) || left.username.localeCompare(right.username)
      );
    });
  }, [query, sortDirection, sortKey, users]);

  const activityTotals = useMemo(
    () =>
      users.reduce(
        (totals, user) => ({
          puzzleVotes: totals.puzzleVotes + user.puzzles_upvoted + user.puzzles_downvoted,
          commentKarma: totals.commentKarma + user.comment_karma,
          comments: totals.comments + user.comments_left,
        }),
        { puzzleVotes: 0, commentKarma: 0, comments: 0 },
      ),
    [users],
  );

  const changeSort = (nextKey: SortKey) => {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "username" ? "asc" : "desc");
  };

  const sortIndicator = (key: SortKey): string => {
    if (sortKey !== key) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  };

  return (
    <div className="page communityPage communityUsersPage">
      <Seo
        title="Community User Activity"
        description="Compare puzzle votes, comment karma, and comments left by Atomic Puzzles users."
        path="/community/users"
      />
      <section className="panel communityPanel">
        <header className="communityHeader">
          <div>
            <span>Community</span>
            <h1>User Activity</h1>
          </div>
        </header>
        {!loading && !error && users.length > 0 ? (
          <dl className="communityActivitySummary">
            <div>
              <dt>Active users</dt>
              <dd>{users.length.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Puzzle votes</dt>
              <dd>{activityTotals.puzzleVotes.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Comments</dt>
              <dd>{activityTotals.comments.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Comment karma</dt>
              <dd className="communityKarmaValue">
                <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                {activityTotals.commentKarma.toLocaleString("en-US")}
              </dd>
            </div>
          </dl>
        ) : null}
        <div className="communityToolbar">
          <label>
            <input
              type="search"
              aria-label="Filter users"
              value={query}
              placeholder="Filter by username"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <span>{`${visibleUsers.length.toLocaleString("en-US")} of ${users.length.toLocaleString("en-US")} users`}</span>
        </div>
        {loading ? <p className="communityStatus">Loading user activity…</p> : null}
        {error ? <p className="communityError">{error}</p> : null}
        {!loading && !error && visibleUsers.length === 0 ? (
          <p className="communityEmpty">No users match this filter.</p>
        ) : null}
        {!loading && !error && visibleUsers.length > 0 ? (
          <div className="communityLeaderboard">
            <div
              className="communityLeaderboardHeader"
              role="group"
              aria-label="Sort user activity"
            >
              <span aria-hidden="true">#</span>
              {columns.map((column) => (
                <button
                  key={column.key}
                  type="button"
                  className={sortKey === column.key ? "active" : ""}
                  aria-pressed={sortKey === column.key}
                  onClick={() => changeSort(column.key)}
                >
                  {column.label}
                  {sortIndicator(column.key)}
                </button>
              ))}
            </div>
            <ol className="communityUserList">
              {visibleUsers.map((user, index) => (
                <li key={user.username}>
                  <article className="communityActivityRow">
                    <span className="communityActivityRank">{index + 1}</span>
                    <Link
                      className="communityActivityUser"
                      to="/@/$username"
                      params={{ username: user.username }}
                    >
                      {user.username}
                    </Link>
                    <div className="communityActivityMetric">
                      <span>Puzzle upvotes</span>
                      <strong>{user.puzzles_upvoted}</strong>
                    </div>
                    <div className="communityActivityMetric">
                      <span>Puzzle downvotes</span>
                      <strong>{user.puzzles_downvoted}</strong>
                    </div>
                    <div className="communityActivityMetric">
                      <span>Comment karma</span>
                      <strong className="communityKarmaValue">
                        <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                        {user.comment_karma}
                      </strong>
                    </div>
                    <div className="communityActivityMetric">
                      <span>Comments left</span>
                      <strong>{user.comments_left}</strong>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>
    </div>
  );
};
