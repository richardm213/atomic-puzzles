import "../Rankings/Rankings.css";
import "./PuzzleLeaderboard.css";

import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { usePersistedState } from "../../hooks/usePersistedState";
import {
  buildPuzzleLeaderboardRows,
  filterPuzzleProgressRowsByPeriod,
  PUZZLE_CORRECT_POINTS,
  PUZZLE_INCORRECT_POINTS,
  type PuzzleLeaderboardPeriod,
  type PuzzleLeaderboardRow,
} from "../../lib/puzzles/puzzleLeaderboard";
import { puzzleLeaderboardProgressQueryOptions } from "../../lib/puzzles/puzzleQueries";
import type { PuzzleProgressWithUsernameRow } from "../../lib/supabase/types";

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

const puzzleLeaderboardPeriodStorageKey = "atomic-puzzles.puzzle-leaderboard-period";
const puzzleLeaderboardMonthStorageKey = "atomic-puzzles.puzzle-rankings-month";
const puzzleLeaderboardPeriodSchema = z.enum(["monthly", "all"]);
const puzzleLeaderboardMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const emptyPuzzleProgressRows: PuzzleProgressWithUsernameRow[] = [];

const currentUtcMonth = (): string => new Date().toISOString().slice(0, 7);

const puzzleRankingMonthLabel = (month: string): string => {
  const date = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

const puzzleRankingMonthOptions = (progressRows: PuzzleProgressWithUsernameRow[]): string[] => {
  const currentMonth = currentUtcMonth();
  const validAttemptMonths = progressRows
    .map((row) => new Date(row?.first_attempt_at ?? ""))
    .filter((date) => !Number.isNaN(date.getTime()))
    .map((date) => date.toISOString().slice(0, 7))
    .filter((month) => month <= currentMonth);
  const earliestMonth = validAttemptMonths.sort()[0] ?? currentMonth;
  const options: string[] = [];
  const cursor = new Date(`${earliestMonth}-01T00:00:00Z`);
  const lastMonth = new Date(`${currentMonth}-01T00:00:00Z`);

  while (cursor <= lastMonth) {
    options.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return options.reverse();
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
  const [period, setPeriod] = usePersistedState<PuzzleLeaderboardPeriod>(
    puzzleLeaderboardPeriodStorageKey,
    puzzleLeaderboardPeriodSchema,
    "monthly",
  );
  const [selectedMonth, setSelectedMonth] = usePersistedState(
    puzzleLeaderboardMonthStorageKey,
    puzzleLeaderboardMonthSchema,
    currentUtcMonth(),
  );
  const [sortKey, setSortKey] = useState<PuzzleLeaderboardSortKey>("score");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const progressQuery = useQuery(puzzleLeaderboardProgressQueryOptions());
  const progressRows = progressQuery.data ?? emptyPuzzleProgressRows;
  const loading = progressQuery.isPending;
  const error = progressQuery.error
    ? progressQuery.error instanceof Error
      ? progressQuery.error.message
      : "Failed to load puzzle rankings."
    : "";

  const monthOptions = useMemo(() => puzzleRankingMonthOptions(progressRows), [progressRows]);
  const effectiveMonth = monthOptions.includes(selectedMonth)
    ? selectedMonth
    : (monthOptions[0] ?? currentUtcMonth());
  const rows = useMemo(
    () =>
      buildPuzzleLeaderboardRows(
        filterPuzzleProgressRowsByPeriod(progressRows, period, effectiveMonth),
      ),
    [effectiveMonth, period, progressRows],
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

  if (loading && progressRows.length === 0) return <RouteLoadingFallback />;

  return (
    <div className="rankingsPage">
      <Seo
        title="Puzzle Rankings"
        description="Browse monthly or all-time Atomic Puzzles rankings by puzzle points, correct solves, and total attempts."
        path="/rankings/puzzles"
      />
      <div className="panel rankingsPanel rankingsLeaderboardPanel puzzleLeaderboardPanel">
        <h1>Puzzle Rankings</h1>

        <div className={`controls rankingsControls puzzleRankingsControls ${period}`}>
          <label htmlFor="puzzle-rankings-period">
            Period
            <select
              id="puzzle-rankings-period"
              value={period}
              onChange={(event) => {
                const nextPeriod = puzzleLeaderboardPeriodSchema.safeParse(event.target.value);
                if (nextPeriod.success) setPeriod(nextPeriod.data);
              }}
            >
              <option value="monthly">Monthly</option>
              <option value="all">All time</option>
            </select>
          </label>

          {period === "monthly" ? (
            <label htmlFor="puzzle-rankings-month">
              Month
              <select
                id="puzzle-rankings-month"
                value={effectiveMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                {monthOptions.map((month) => (
                  <option key={month} value={month}>
                    {puzzleRankingMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="puzzleLeaderboardScoring" aria-label="Puzzle rankings scoring">
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
        </div>

        {error ? <div className="errorText">{error}</div> : null}

        {!error && !loading && rows.length === 0 ? (
          <div className="emptyRankings">
            {period === "all"
              ? "No users have recorded puzzle attempts yet."
              : `No users recorded puzzle attempts in ${puzzleRankingMonthLabel(effectiveMonth)}.`}
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
