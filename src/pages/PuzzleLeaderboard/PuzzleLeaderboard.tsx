import "../Rankings/Rankings.css";
import "./PuzzleLeaderboard.css";

import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";

import { DataTable } from "../../components/DataTable/DataTable";
import { SortableTableHeader } from "../../components/DataTable/SortableTableHeader";
import { InlineState } from "../../components/InlineState/InlineState";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { usePersistedState } from "../../hooks/usePersistedState";
import { useTableSort } from "../../hooks/useTableSort";
import {
  buildPuzzleLeaderboardRows,
  filterPuzzleProgressRowsByPeriod,
  PUZZLE_CORRECT_POINTS,
  PUZZLE_INCORRECT_POINTS,
  type PuzzleLeaderboardPeriod,
  type PuzzleLeaderboardRow,
} from "../../lib/puzzles/puzzleLeaderboard";
import {
  puzzleLeaderboardProgressQueryOptions,
  puzzleUserRatingsQueryOptions,
} from "../../lib/puzzles/puzzleQueries";
import type { PuzzleProgressWithUsernameRow } from "../../lib/supabase/types";

type PuzzleLeaderboardSortKey = keyof Pick<
  PuzzleLeaderboardRow & { rating: number; ratingDeviation: number },
  "rank" | "username" | "rating" | "ratingDeviation" | "score" | "attempted" | "percentCorrect"
>;

const puzzleLeaderboardColumns: Array<{ key: PuzzleLeaderboardSortKey; label: string }> = [
  { key: "score", label: "Pts" },
  { key: "rank", label: "#" },
  { key: "username", label: "Player" },
  { key: "rating", label: "Rating" },
  { key: "ratingDeviation", label: "RD" },
  { key: "attempted", label: "Tries" },
  { key: "percentCorrect", label: "Accuracy" },
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
  const { changeSort, sortDirection, sortKey } = useTableSort<PuzzleLeaderboardSortKey>({
    initialKey: "score",
    getDefaultDirection: (key) => (key === "rank" || key === "username" ? "asc" : "desc"),
  });
  const progressQuery = useQuery(puzzleLeaderboardProgressQueryOptions());
  const ratingsQuery = useQuery(puzzleUserRatingsQueryOptions());
  const progressRows = progressQuery.data ?? emptyPuzzleProgressRows;
  const loading = progressQuery.isPending || ratingsQuery.isPending;
  const queryError = progressQuery.error ?? ratingsQuery.error;
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load puzzle rankings."
    : "";

  const monthOptions = useMemo(() => puzzleRankingMonthOptions(progressRows), [progressRows]);
  const effectiveMonth = monthOptions.includes(selectedMonth)
    ? selectedMonth
    : (monthOptions[0] ?? currentUtcMonth());
  const rows = useMemo(() => {
    const ratingsByUsername = new Map(
      (ratingsQuery.data ?? []).map((rating) => [rating.username, rating] as const),
    );
    return buildPuzzleLeaderboardRows(
      filterPuzzleProgressRowsByPeriod(progressRows, period, effectiveMonth),
    ).map((row) => {
      const rating = ratingsByUsername.get(row.username);
      return {
        ...row,
        rating: rating?.rating ?? 2000,
        ratingDeviation: rating?.ratingDeviation ?? 350,
      };
    });
  }, [effectiveMonth, period, progressRows, ratingsQuery.data]);

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

        {error ? <InlineState kind="error">{error}</InlineState> : null}

        {!error && !loading && rows.length === 0 ? (
          <InlineState kind="empty">
            {period === "all"
              ? "No users have recorded puzzle attempts yet."
              : `No users recorded puzzle attempts in ${puzzleRankingMonthLabel(effectiveMonth)}.`}
          </InlineState>
        ) : null}

        {!error && !loading && rows.length > 0 ? (
          <DataTable
            wrapperClassName="rankingsTableWrap"
            className="rankingsTable puzzleLeaderboardTable"
          >
            <thead>
              <tr>
                {puzzleLeaderboardColumns.map((column) => (
                  <SortableTableHeader
                    key={column.key}
                    active={sortKey === column.key}
                    direction={sortDirection}
                    label={column.label}
                    onSort={() => changeSort(column.key)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.username}>
                  <td>{row.score}</td>
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
                  <td>{row.rating}</td>
                  <td>{row.ratingDeviation}</td>
                  <td>{row.attempted}</td>
                  <td>{row.percentCorrect}%</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
      </div>
    </div>
  );
};

export const PuzzleLeaderboardPage = () => <PuzzleLeaderboard />;
