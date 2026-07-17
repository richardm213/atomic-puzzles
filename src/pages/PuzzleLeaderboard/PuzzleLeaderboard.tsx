import "../Rankings/Rankings.css";
import "./PuzzleLeaderboard.css";

import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import {
  buildPuzzleLeaderboardRows,
  filterPuzzleProgressRowsByPeriod,
  PUZZLE_CORRECT_POINTS,
  PUZZLE_INCORRECT_POINTS,
  type PuzzleLeaderboardPeriod,
  type PuzzleLeaderboardRow,
} from "../../lib/puzzles/puzzleLeaderboard";
import { fetchAllPuzzleProgressRows } from "../../lib/supabase/supabasePuzzleProgress";
import type { PuzzleProgressWithUsernameRow } from "../../types/supabase";

type PuzzleLeaderboardSortKey = keyof Pick<
  PuzzleLeaderboardRow,
  "rank" | "username" | "score" | "correct" | "incorrect" | "percentCorrect"
>;

const puzzleLeaderboardColumns: Array<{ key: PuzzleLeaderboardSortKey; label: string }> = [
  { key: "rank", label: "#" },
  { key: "username", label: "Player" },
  { key: "score", label: "Points" },
  { key: "correct", label: "# correct" },
  { key: "incorrect", label: "# incorrect" },
  { key: "percentCorrect", label: "% correct" },
];

const puzzleLeaderboardPeriodLabels: Record<PuzzleLeaderboardPeriod, string> = {
  all: "All time",
  "30days": "Last 30 days",
  "90days": "Last 90 days",
};

const sortIndicator = (
  sortKey: PuzzleLeaderboardSortKey,
  sortDirection: "asc" | "desc",
  columnKey: PuzzleLeaderboardSortKey,
): string => {
  if (sortKey !== columnKey) return "";
  return sortDirection === "asc" ? "↑" : "↓";
};

const PuzzleLeaderboard = () => {
  const [progressRows, setProgressRows] = useState<PuzzleProgressWithUsernameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState<PuzzleLeaderboardPeriod>("all");
  const [sortKey, setSortKey] = useState<PuzzleLeaderboardSortKey>("score");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let isCurrent = true;

    const loadLeaderboard = async () => {
      setLoading(true);
      setError("");

      try {
        const progressRows = await fetchAllPuzzleProgressRows();
        if (!isCurrent) return;

        setProgressRows(progressRows);
      } catch (loadError) {
        if (!isCurrent) return;
        setProgressRows([]);
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load puzzle leaderboard.",
        );
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    void loadLeaderboard();

    return () => {
      isCurrent = false;
    };
  }, []);

  const rows = useMemo(
    () => buildPuzzleLeaderboardRows(filterPuzzleProgressRowsByPeriod(progressRows, period)),
    [period, progressRows],
  );

  const handleSort = (nextKey: PuzzleLeaderboardSortKey): void => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "rank" || nextKey === "username" ? "asc" : "desc");
  };

  const sortedRows = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    return [...rows].sort((left, right) => {
      if (sortKey === "username") {
        const usernameCompare = directionMultiplier * left.username.localeCompare(right.username);
        if (usernameCompare !== 0) return usernameCompare;
        return left.rank - right.rank;
      }

      const leftValue = left[sortKey];
      const rightValue = right[sortKey];
      if (leftValue !== rightValue) {
        return directionMultiplier * (Number(leftValue) - Number(rightValue));
      }

      if (left.rank !== right.rank) return left.rank - right.rank;
      return left.username.localeCompare(right.username);
    });
  }, [rows, sortDirection, sortKey]);

  const attemptedCount = useMemo(
    () => rows.reduce((total, row) => total + row.attempted, 0),
    [rows],
  );

  return (
    <div className="rankingsPage">
      <Seo
        title="Puzzle Points Leaderboard"
        description="Rank Atomic Puzzles users with recorded puzzle attempts by puzzle points, correct puzzle solves, and total attempts."
        path="/solve/leaderboard"
      />
      <div className="panel rankingsPanel puzzleLeaderboardPanel">
        <h1>Puzzle Points Leaderboard</h1>

        <div className="puzzleLeaderboardScoring" aria-label="Puzzle leaderboard scoring">
          <span className="puzzleLeaderboardScoringLabel">Scoring</span>
          <span className="puzzleLeaderboardScoringRule positive">
            <span className="puzzleLeaderboardScoringPoints">
              {PUZZLE_CORRECT_POINTS > 0 ? "+" : ""}
              {PUZZLE_CORRECT_POINTS}
            </span>
            <span>correct</span>
          </span>
          <span className="puzzleLeaderboardScoringRule negative">
            <span className="puzzleLeaderboardScoringPoints">{PUZZLE_INCORRECT_POINTS}</span>
            <span>incorrect</span>
          </span>
        </div>

        <div className="puzzleLeaderboardPeriod" role="group" aria-label="Leaderboard period">
          <button
            type="button"
            className={period === "all" ? "active" : ""}
            aria-pressed={period === "all"}
            onClick={() => setPeriod("all")}
          >
            All time
          </button>
          <button
            type="button"
            className={period === "30days" ? "active" : ""}
            aria-pressed={period === "30days"}
            onClick={() => setPeriod("30days")}
          >
            Last 30 days
          </button>
          <button
            type="button"
            className={period === "90days" ? "active" : ""}
            aria-pressed={period === "90days"}
            onClick={() => setPeriod("90days")}
          >
            Last 90 days
          </button>
        </div>

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta puzzleLeaderboardMeta">
          <span>
            {loading
              ? "Loading puzzle leaderboard..."
              : `${period === "all" ? "" : `${puzzleLeaderboardPeriodLabels[period]}: `}${rows.length} users, ${attemptedCount} recorded attempts`}
          </span>
          <span className="rankedCount">
            <Link className="rankingsMetaLink" to="/solve">
              Solve puzzles
            </Link>
            <Link className="rankingsMetaLink" to="/dashboard">
              Puzzle dashboard
            </Link>
          </span>
        </div>

        {!error && loading ? (
          <div className="emptyRankings">Loading puzzle leaderboard...</div>
        ) : null}

        {!error && !loading && rows.length === 0 ? (
          <div className="emptyRankings">
            {period === "all"
              ? "No users have recorded puzzle attempts yet."
              : `No users have recorded puzzle attempts in the ${puzzleLeaderboardPeriodLabels[period].toLowerCase()}.`}
          </div>
        ) : null}

        {!error && !loading && rows.length > 0 ? (
          <div className="rankingsTableWrap">
            <table className="rankingsTable puzzleLeaderboardTable">
              <thead>
                <tr>
                  {puzzleLeaderboardColumns.map((column) => (
                    <th key={column.key}>
                      <button
                        type="button"
                        className="sortButton"
                        onClick={() => handleSort(column.key)}
                      >
                        {column.label} {sortIndicator(sortKey, sortDirection, column.key)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row) => (
                  <tr key={row.username}>
                    <td>{row.rank}</td>
                    <td>
                      <span className="puzzleLeaderboardPlayerCell">
                        <Link
                          className="rankingLink"
                          to="/@/$username"
                          params={{ username: row.username }}
                        >
                          {row.username}
                        </Link>
                        <Link
                          className="puzzleLeaderboardDashboardLink"
                          to="/@/$username/puzzles"
                          params={{ username: row.username }}
                          aria-label={`Open ${row.username}'s puzzle dashboard`}
                          title="Puzzle dashboard"
                        >
                          <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
                        </Link>
                      </span>
                    </td>
                    <td>{row.score}</td>
                    <td>{row.correct}</td>
                    <td>{row.incorrect}</td>
                    <td>{row.percentCorrect}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const PuzzleLeaderboardPage = () => <PuzzleLeaderboard />;
