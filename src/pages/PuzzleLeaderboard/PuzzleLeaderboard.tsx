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
  MONTHLY_PUZZLE_MAX_RD,
  MONTHLY_PUZZLE_MIN_ATTEMPTS,
  type PuzzleLeaderboardPeriod,
  type PuzzleLeaderboardRow,
  puzzleTrophyLevel,
} from "../../lib/puzzles/puzzleLeaderboard";
import {
  puzzleLeaderboardProgressQueryOptions,
  puzzleLeaderboardQueryOptions,
} from "../../lib/puzzles/puzzleQueries";
import type { PuzzleProgressWithUsernameRow } from "../../lib/supabase/types";
import { appAssetPath } from "../../utils/appAssetPath";

type PuzzleLeaderboardSortKey = keyof Pick<
  PuzzleLeaderboardRow,
  "rank" | "username" | "rating" | "ratingDeviation" | "attempted" | "percentCorrect"
>;

const puzzleLeaderboardColumns: Array<{ key: PuzzleLeaderboardSortKey; label: string }> = [
  { key: "rank", label: "#" },
  { key: "username", label: "Player" },
  { key: "rating", label: "Rating" },
  { key: "ratingDeviation", label: "RD" },
  { key: "attempted", label: "Tries" },
  { key: "percentCorrect", label: "Accuracy" },
];

const puzzleLeaderboardPeriodStorageKey = "atomic-puzzles.puzzle-leaderboard-period";
const puzzleLeaderboardMonthStorageKey = "atomic-puzzles.puzzle-rankings-month";
const puzzleLeaderboardShowAllStorageKey = "atomic-puzzles.puzzle-rankings-show-all";
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

const trophyAsset = (rank: number | null): string => {
  const level = puzzleTrophyLevel(rank);
  if (level === "gold") return appAssetPath("/images/atomic-rank-trophies/top-1.png");
  if (level === "red") return appAssetPath("/images/atomic-rank-trophies/top-2.png");
  if (level === "silver") return appAssetPath("/images/atomic-rank-trophies/top-10.png");
  return "";
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
  const [showAllPlayers, setShowAllPlayers] = usePersistedState(
    puzzleLeaderboardShowAllStorageKey,
    z.boolean(),
    false,
  );
  const { changeSort, sortDirection, sortKey } = useTableSort<PuzzleLeaderboardSortKey>({
    initialKey: "rating",
    getDefaultDirection: (key) => (key === "rank" || key === "username" ? "asc" : "desc"),
  });
  const progressQuery = useQuery(puzzleLeaderboardProgressQueryOptions());
  const progressRows = progressQuery.data ?? emptyPuzzleProgressRows;
  const monthOptions = useMemo(() => puzzleRankingMonthOptions(progressRows), [progressRows]);
  const effectiveMonth = monthOptions.includes(selectedMonth)
    ? selectedMonth
    : (monthOptions[0] ?? currentUtcMonth());
  const leaderboardQuery = useQuery(puzzleLeaderboardQueryOptions(period, effectiveMonth));
  const loading = progressQuery.isPending || leaderboardQuery.isPending;
  const queryError = progressQuery.error ?? leaderboardQuery.error;
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : "Failed to load puzzle rankings."
    : "";
  const allRows = useMemo(
    () => buildPuzzleLeaderboardRows(leaderboardQuery.data ?? [], period),
    [leaderboardQuery.data, period],
  );
  const rows = useMemo(
    () =>
      period === "monthly" && showAllPlayers ? allRows : allRows.filter((row) => row.eligible),
    [allRows, period, showAllPlayers],
  );
  const sortedRows = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      if (sortKey === "username") {
        const usernameCompare = directionMultiplier * left.username.localeCompare(right.username);
        if (usernameCompare !== 0) return usernameCompare;
      } else if (sortKey === "rank") {
        const leftRank = left.rank ?? Number.POSITIVE_INFINITY;
        const rightRank = right.rank ?? Number.POSITIVE_INFINITY;
        if (leftRank !== rightRank) return directionMultiplier * (leftRank - rightRank);
      } else if (left[sortKey] !== right[sortKey]) {
        return directionMultiplier * (Number(left[sortKey]) - Number(right[sortKey]));
      }
      return (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY);
    });
  }, [rows, sortDirection, sortKey]);
  const showCurrentTrophies = period === "monthly" && effectiveMonth === currentUtcMonth();

  if (loading && !leaderboardQuery.data) return <RouteLoadingFallback />;

  return (
    <div className="rankingsPage">
      <Seo
        title="Puzzle Rankings"
        description="Browse monthly and all-time Atomic Puzzles rankings by puzzle rating."
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
            <>
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
              <label className="puzzleLeaderboardEligibilityToggle">
                <input
                  type="checkbox"
                  checked={showAllPlayers}
                  onChange={(event) => setShowAllPlayers(event.target.checked)}
                />
                Show all players
              </label>
            </>
          ) : null}
        </div>

        {period === "monthly" ? (
          <p className="puzzleLeaderboardEligibilityNote">
            Official ranks require at least {MONTHLY_PUZZLE_MIN_ATTEMPTS} attempts and RD below{" "}
            {MONTHLY_PUZZLE_MAX_RD} in the selected month.
          </p>
        ) : null}

        {error ? <InlineState kind="error">{error}</InlineState> : null}

        {!error && !loading && rows.length === 0 ? (
          <InlineState kind="empty">
            {period === "all"
              ? "No players have at least 20 puzzle attempts yet."
              : showAllPlayers
                ? `No users recorded puzzle attempts in ${puzzleRankingMonthLabel(effectiveMonth)}.`
                : `No players met the monthly ranking requirements in ${puzzleRankingMonthLabel(effectiveMonth)}.`}
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
              {sortedRows.map((row) => {
                const trophy = showCurrentTrophies && row.eligible ? trophyAsset(row.rank) : "";
                return (
                  <tr key={row.username} className={row.eligible ? "" : "isIneligible"}>
                    <td>{row.rank ?? "—"}</td>
                    <td>
                      <span className="puzzleLeaderboardPlayerCell">
                        {trophy ? (
                          <img
                            className="puzzleLeaderboardTrophy"
                            src={trophy}
                            alt=""
                            aria-hidden="true"
                          />
                        ) : null}
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
                );
              })}
            </tbody>
          </DataTable>
        ) : null}
      </div>
    </div>
  );
};

export const PuzzleLeaderboardPage = () => <PuzzleLeaderboard />;
