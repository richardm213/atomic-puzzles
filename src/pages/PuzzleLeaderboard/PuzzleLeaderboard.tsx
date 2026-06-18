import "../Rankings/Rankings.css";
import "./PuzzleLeaderboard.css";

import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import {
  buildPuzzleLeaderboardRows,
  PUZZLE_CORRECT_POINTS,
  PUZZLE_INCORRECT_POINTS,
  type PuzzleLeaderboardRow,
} from "../../lib/puzzles/puzzleLeaderboard";
import { fetchAllPuzzleProgressRows } from "../../lib/supabase/supabasePuzzleProgress";

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

const sortIndicator = (
  sortKey: PuzzleLeaderboardSortKey,
  sortDirection: "asc" | "desc",
  columnKey: PuzzleLeaderboardSortKey,
): string => {
  if (sortKey !== columnKey) return "";
  return sortDirection === "asc" ? "↑" : "↓";
};

const PuzzleLeaderboard = () => {
  const [rows, setRows] = useState<PuzzleLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

        setRows(buildPuzzleLeaderboardRows(progressRows));
      } catch (loadError) {
        if (!isCurrent) return;
        setRows([]);
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
        const usernameCompare =
          directionMultiplier * left.username.localeCompare(right.username);
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
        title="Atomic Puzzle Leaderboard"
        description="Rank Atomic Puzzles users with recorded puzzle attempts by puzzle points, correct puzzle solves, and total attempts."
        path="/solve/leaderboard"
      />
      <div className="panel rankingsPanel puzzleLeaderboardPanel">
        <h1>Puzzle Leaderboard</h1>

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

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta puzzleLeaderboardMeta">
          <span>
            {loading
              ? "Loading puzzle leaderboard..."
              : `${rows.length} users, ${attemptedCount} recorded attempts`}
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
          <div className="emptyRankings">No users have recorded puzzle attempts yet.</div>
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
                      <Link
                        className="rankingLink"
                        to="/@/$username"
                        params={{ username: row.username }}
                      >
                        {row.username}
                      </Link>
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
