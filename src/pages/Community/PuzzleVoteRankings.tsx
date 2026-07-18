import "./Community.css";

import { faArrowDown, faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import {
  fetchPuzzleRankings,
  type PuzzleRankings,
  type PuzzleVoteRankingRow,
} from "../../lib/community/puzzleCommunity";

type VoteSortKey = "upvotes" | "downvotes";

export const PuzzleVoteRankingsPage = () => {
  const [rankings, setRankings] = useState<PuzzleRankings | null>(null);
  const [sortKey, setSortKey] = useState<VoteSortKey>("upvotes");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    void fetchPuzzleRankings()
      .then((result) => {
        if (current) setRankings(result);
      })
      .catch((loadError) => {
        if (current) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load rankings.");
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);

  const sortedPuzzles = useMemo(() => {
    const multiplier = sortDirection === "asc" ? 1 : -1;
    return [...(rankings?.puzzles ?? [])].sort(
      (left, right) =>
        multiplier * (left[sortKey] - right[sortKey]) || left.puzzle_id - right.puzzle_id,
    );
  }, [rankings?.puzzles, sortDirection, sortKey]);

  const totals = useMemo(
    () =>
      (rankings?.puzzles ?? []).reduce(
        (result, puzzle) => ({
          upvotes: result.upvotes + puzzle.upvotes,
          downvotes: result.downvotes + puzzle.downvotes,
          score: result.score + puzzle.score,
        }),
        { upvotes: 0, downvotes: 0, score: 0 },
      ),
    [rankings?.puzzles],
  );

  const changeSort = (nextKey: VoteSortKey): void => {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection("desc");
  };

  const sortIndicator = (key: VoteSortKey): string => {
    if (key !== sortKey) return "";
    return sortDirection === "asc" ? " ↑" : " ↓";
  };

  if (loading && !rankings) return <RouteLoadingFallback />;

  return (
    <div className="page communityPage communityVotesPage">
      <Seo
        title="Puzzle Vote Rankings"
        description="Sort Atomic Puzzles by community upvotes and downvotes."
        path="/community/puzzles"
      />
      <section className="panel communityPanel">
        <header className="communityHeader">
          <div>
            <span>Community</span>
            <h1>Puzzle Votes</h1>
          </div>
        </header>
        {!loading && !error && rankings ? (
          <dl className="communityActivitySummary">
            <div>
              <dt>Rated puzzles</dt>
              <dd>{rankings.puzzles.length.toLocaleString("en-US")}</dd>
            </div>
            <div>
              <dt>Upvotes</dt>
              <dd className="communityVoteSummaryValue upvote">
                <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                {totals.upvotes.toLocaleString("en-US")}
              </dd>
            </div>
            <div>
              <dt>Downvotes</dt>
              <dd className="communityVoteSummaryValue downvote">
                <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
                {totals.downvotes.toLocaleString("en-US")}
              </dd>
            </div>
            <div>
              <dt>Net score</dt>
              <dd>{totals.score.toLocaleString("en-US")}</dd>
            </div>
          </dl>
        ) : null}
        <div className="communityVoteToolbar">
          <div className="communityVoteSort" role="group" aria-label="Sort puzzle votes">
            <button
              type="button"
              className={sortKey === "upvotes" ? "active" : ""}
              aria-pressed={sortKey === "upvotes"}
              onClick={() => changeSort("upvotes")}
            >
              Upvotes
            </button>
            <button
              type="button"
              className={sortKey === "downvotes" ? "active" : ""}
              aria-pressed={sortKey === "downvotes"}
              onClick={() => changeSort("downvotes")}
            >
              Downvotes
            </button>
          </div>
          <button
            type="button"
            className="communityVoteDirection"
            onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
          >
            <FontAwesomeIcon
              icon={sortDirection === "desc" ? faArrowDown : faArrowUp}
              aria-hidden="true"
            />
            {sortDirection === "desc" ? "Highest first" : "Lowest first"}
          </button>
        </div>
        {error ? <p className="communityError">{error}</p> : null}
        {!loading && !error && sortedPuzzles.length === 0 ? (
          <p className="communityEmpty">No puzzle votes yet.</p>
        ) : null}
        {!loading && !error && sortedPuzzles.length > 0 ? (
          <div className="communityTableWrap communityVoteTableWrap">
            <table className="communityTable communityVoteTable">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Puzzle</th>
                  <th scope="col" className="communityNumericCell">
                    <button type="button" onClick={() => changeSort("upvotes")}>
                      Upvotes{sortIndicator("upvotes")}
                    </button>
                  </th>
                  <th scope="col" className="communityNumericCell">
                    <button type="button" onClick={() => changeSort("downvotes")}>
                      Downvotes{sortIndicator("downvotes")}
                    </button>
                  </th>
                  <th scope="col" className="communityNumericCell">
                    Score
                  </th>
                  <th scope="col" className="communityNumericCell">
                    Attempts
                  </th>
                  <th scope="col" className="communityNumericCell">
                    Solve rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPuzzles.map((puzzle: PuzzleVoteRankingRow, index) => (
                  <tr key={puzzle.puzzle_id}>
                    <td className="communityRank">{index + 1}</td>
                    <td>
                      <Link to="/solve/$puzzleId" params={{ puzzleId: String(puzzle.puzzle_id) }}>
                        Puzzle #{puzzle.puzzle_id}
                      </Link>
                    </td>
                    <td className="communityNumericCell communityPositive">{puzzle.upvotes}</td>
                    <td className="communityNumericCell communityNegative">{puzzle.downvotes}</td>
                    <td className="communityNumericCell">{puzzle.score}</td>
                    <td className="communityNumericCell">{puzzle.attempts}</td>
                    <td className="communityNumericCell">
                      {puzzle.solve_rate === null ? "—" : `${puzzle.solve_rate}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
};
