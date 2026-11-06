import "../Rankings/Rankings.css";
import "./PuzzleLeaderboard.css";

import { faArrowDown, faArrowUp, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
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
  puzzleCreatorLeaderboardQueryOptions,
  puzzleLeaderboardQueryOptions,
} from "../../lib/puzzles/puzzleQueries";
import type { PuzzleCreatorLeaderboardRow } from "../../lib/supabase/puzzleUserRatings";
import { appAssetPath } from "../../utils/appAssetPath";
import { getErrorMessage } from "../../utils/errors";
import { formatCalendarMonth } from "../../utils/formatters";

type PuzzleLeaderboardSortKey = keyof Pick<
  PuzzleLeaderboardRow,
  | "rank"
  | "username"
  | "leaderboardScore"
  | "rating"
  | "activityBonus"
  | "ratingDeviation"
  | "attempted"
  | "percentCorrect"
  | "averageSeconds"
>;

type PuzzleCreatorSortKey = keyof Pick<
  PuzzleCreatorLeaderboardRow,
  "rank" | "username" | "puzzleKarma" | "puzzlesCreated"
>;

const puzzleLeaderboardColumns: Array<{
  key: PuzzleLeaderboardSortKey;
  label: string;
  title: string;
}> = [
  { key: "rank", label: "#", title: "Rank" },
  { key: "username", label: "Player", title: "Player" },
  { key: "leaderboardScore", label: "Score", title: "Puzzle rating plus activity bonus" },
  { key: "rating", label: "Rating", title: "Puzzle rating before activity bonus" },
  { key: "activityBonus", label: "Bonus", title: "Activity bonus" },
  { key: "ratingDeviation", label: "RD", title: "Rating deviation" },
  { key: "attempted", label: "ATT", title: "Total attempts" },
  { key: "percentCorrect", label: "ACC", title: "Accuracy" },
  {
    key: "averageSeconds",
    label: "TIME",
    title: "Average time spent per puzzle",
  },
];

const puzzleLeaderboardPeriodStorageKey = "atomic-puzzles.puzzle-leaderboard-period";
const puzzleLeaderboardTypeStorageKey = "atomic-puzzles.puzzle-leaderboard-type";
const puzzleLeaderboardMonthStorageKey = "atomic-puzzles.puzzle-rankings-month";
const puzzleLeaderboardShowAllStorageKey = "atomic-puzzles.puzzle-rankings-show-all";
const puzzleAverageTimeStartMonth = "2026-10";
const puzzleLeaderboardPeriodSchema = z.enum(["monthly", "all"]);
const puzzleLeaderboardTypeSchema = z.enum(["solvers", "creators"]);
const puzzleLeaderboardMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const currentUtcMonth = (): string => new Date().toISOString().slice(0, 7);

const puzzleRankingMonthLabel = (month: string): string => formatCalendarMonth(month) || month;

const puzzleRankingMonthOptions = (availableMonths: string[]): string[] => {
  const currentMonth = currentUtcMonth();
  const earliestMonth =
    [...availableMonths].filter((month) => month <= currentMonth).sort()[0] ?? currentMonth;
  const options: string[] = [];
  const cursor = new Date(`${earliestMonth}-01T00:00:00Z`);
  const lastMonth = new Date(`${currentMonth}-01T00:00:00Z`);
  while (cursor <= lastMonth) {
    options.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return options.reverse();
};

const puzzleCreatorLeaderboardColumns: Array<{
  key: PuzzleCreatorSortKey;
  label: string;
  title: string;
}> = [
  { key: "rank", label: "#", title: "Rank" },
  { key: "username", label: "Creator", title: "Puzzle creator" },
  { key: "puzzleKarma", label: "Karma", title: "Net puzzle karma" },
  { key: "puzzlesCreated", label: "Puzzles", title: "Puzzles created" },
];

const trophyAsset = (rank: number | null): string => {
  const level = puzzleTrophyLevel(rank);
  if (level === "gold") return appAssetPath("/images/atomic-rank-trophies/top-1.png");
  if (level === "red") return appAssetPath("/images/atomic-rank-trophies/top-2.png");
  if (level === "silver") return appAssetPath("/images/atomic-rank-trophies/top-10.png");
  return "";
};

const PuzzleLeaderboard = () => {
  const queryClient = useQueryClient();
  const [leaderboardType, setLeaderboardType] = usePersistedState(
    puzzleLeaderboardTypeStorageKey,
    puzzleLeaderboardTypeSchema,
    "solvers",
  );
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
    initialKey: "leaderboardScore",
    getDefaultDirection: (key) => (key === "rank" || key === "username" ? "asc" : "desc"),
  });
  const {
    changeSort: changeCreatorSort,
    sortDirection: creatorSortDirection,
    sortKey: creatorSortKey,
  } = useTableSort<PuzzleCreatorSortKey>({
    initialKey: "puzzleKarma",
    getDefaultDirection: (key) => (key === "rank" || key === "username" ? "asc" : "desc"),
  });
  const requestedMonth = selectedMonth <= currentUtcMonth() ? selectedMonth : currentUtcMonth();
  const solverLeaderboardQuery = useQuery({
    ...puzzleLeaderboardQueryOptions(period, requestedMonth),
    enabled: leaderboardType === "solvers",
  });
  const creatorLeaderboardQuery = useQuery({
    ...puzzleCreatorLeaderboardQueryOptions(period, requestedMonth),
    enabled: leaderboardType === "creators",
  });
  const leaderboardData =
    leaderboardType === "solvers" ? solverLeaderboardQuery.data : creatorLeaderboardQuery.data;
  const monthOptions = useMemo(
    () => puzzleRankingMonthOptions(leaderboardData?.months ?? []),
    [leaderboardData?.months],
  );
  const effectiveMonth = monthOptions.includes(selectedMonth)
    ? selectedMonth
    : (monthOptions[0] ?? currentUtcMonth());
  useEffect(() => {
    if (leaderboardData && effectiveMonth !== selectedMonth) {
      setSelectedMonth(effectiveMonth);
    }
  }, [effectiveMonth, leaderboardData, selectedMonth, setSelectedMonth]);
  useEffect(() => {
    if (period !== "monthly" || !leaderboardData) return;
    const selectedIndex = monthOptions.indexOf(effectiveMonth);
    const adjacentMonths = [
      monthOptions[selectedIndex - 1],
      monthOptions[selectedIndex + 1],
    ].filter((month): month is string => Boolean(month));
    adjacentMonths.forEach((month) => {
      if (leaderboardType === "solvers") {
        void queryClient.prefetchQuery(puzzleLeaderboardQueryOptions("monthly", month));
      } else {
        void queryClient.prefetchQuery(puzzleCreatorLeaderboardQueryOptions("monthly", month));
      }
    });
  }, [effectiveMonth, leaderboardData, leaderboardType, monthOptions, period, queryClient]);
  const activeQuery =
    leaderboardType === "solvers" ? solverLeaderboardQuery : creatorLeaderboardQuery;
  const loading = activeQuery.isPending;
  const queryError = activeQuery.error;
  const error = queryError ? getErrorMessage(queryError, "Failed to load puzzle rankings.") : "";
  const allRows = useMemo(
    () => buildPuzzleLeaderboardRows(solverLeaderboardQuery.data?.rows ?? [], period),
    [solverLeaderboardQuery.data?.rows, period],
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
      } else if (sortKey === "averageSeconds") {
        if (left.averageSeconds === null) return 1;
        if (right.averageSeconds === null) return -1;
        if (left.averageSeconds !== right.averageSeconds) {
          return directionMultiplier * (left.averageSeconds - right.averageSeconds);
        }
      } else if (left[sortKey] !== right[sortKey]) {
        return directionMultiplier * (Number(left[sortKey]) - Number(right[sortKey]));
      }
      return (left.rank ?? Number.POSITIVE_INFINITY) - (right.rank ?? Number.POSITIVE_INFINITY);
    });
  }, [rows, sortDirection, sortKey]);
  const sortedCreatorRows = useMemo(() => {
    const directionMultiplier = creatorSortDirection === "asc" ? 1 : -1;
    return [...(creatorLeaderboardQuery.data?.rows ?? [])].sort((left, right) => {
      if (creatorSortKey === "username") {
        const usernameCompare = directionMultiplier * left.username.localeCompare(right.username);
        if (usernameCompare !== 0) return usernameCompare;
      } else if (left[creatorSortKey] !== right[creatorSortKey]) {
        return directionMultiplier * (Number(left[creatorSortKey]) - Number(right[creatorSortKey]));
      }
      return left.rank - right.rank || left.username.localeCompare(right.username);
    });
  }, [creatorLeaderboardQuery.data?.rows, creatorSortDirection, creatorSortKey]);
  const showCurrentTrophies = period === "monthly" && effectiveMonth === currentUtcMonth();
  const showAverageTime = period === "all" || effectiveMonth >= puzzleAverageTimeStartMonth;
  const infoText =
    leaderboardType === "creators"
      ? `Creators are ranked only by puzzle karma: upvotes minus downvotes received on ${period === "monthly" ? "puzzles created in the selected month" : "all of their puzzles"}. A creator's own votes do not count. Votes given are shown for context and do not affect rank.`
      : period === "monthly"
        ? `Score = Rating + Activity bonus. The bonus rises smoothly with rated attempts in the selected month: about +9 at 100 attempts, +32 at 500, and +43 at 1,000, with a maximum of +50. Official ranks require at least ${MONTHLY_PUZZLE_MIN_ATTEMPTS} attempts and RD below ${MONTHLY_PUZZLE_MAX_RD}.`
        : "Score = Rating + Activity bonus. The bonus uses rated attempts from the last 120 days: about +9 at 100 attempts, +32 at 500, and +43 at 1,000, with a maximum of +50. ATT remains the player's all-time total.";

  if (loading && !leaderboardData) return <RouteLoadingFallback />;

  return (
    <div className="rankingsPage">
      <Seo
        title="Puzzle Rankings"
        description="Browse monthly and all-time Atomic Puzzles rankings by puzzle rating."
        path="/rankings/puzzles"
      />
      <div className="panel rankingsPanel rankingsLeaderboardPanel puzzleLeaderboardPanel">
        <div className="puzzleLeaderboardTitleRow">
          <h1>Puzzle Rankings</h1>
          <span className="puzzleLeaderboardInfo">
            <button type="button" aria-label="How puzzle rankings work">
              <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
            </button>
            <span className="puzzleLeaderboardInfoTooltip" role="tooltip">
              {infoText}
            </span>
          </span>
        </div>

        <div className="puzzleLeaderboardToolbar">
          <div className="puzzleLeaderboardTypeSwitch" role="group" aria-label="Ranking type">
            <button
              type="button"
              className={leaderboardType === "solvers" ? "active" : ""}
              aria-pressed={leaderboardType === "solvers"}
              onClick={() => setLeaderboardType("solvers")}
            >
              Solver rankings
            </button>
            <button
              type="button"
              className={leaderboardType === "creators" ? "active" : ""}
              aria-pressed={leaderboardType === "creators"}
              onClick={() => setLeaderboardType("creators")}
            >
              Creator rankings
            </button>
          </div>

          <div
            className={`controls rankingsControls puzzleRankingsControls ${period} ${leaderboardType}`}
          >
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
                {leaderboardType === "solvers" ? (
                  <label className="puzzleLeaderboardEligibilityToggle">
                    <input
                      type="checkbox"
                      checked={showAllPlayers}
                      onChange={(event) => setShowAllPlayers(event.target.checked)}
                    />
                    Show all players
                  </label>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        {error ? <InlineState kind="error">{error}</InlineState> : null}

        {!error &&
        !loading &&
        (leaderboardType === "solvers" ? rows.length === 0 : sortedCreatorRows.length === 0) ? (
          <InlineState kind="empty">
            {leaderboardType === "creators"
              ? period === "all"
                ? "No puzzle creators found."
                : `No puzzles were created in ${puzzleRankingMonthLabel(effectiveMonth)}.`
              : period === "all"
                ? "No players have at least 20 puzzle attempts yet."
                : showAllPlayers
                  ? `No users recorded puzzle attempts in ${puzzleRankingMonthLabel(effectiveMonth)}.`
                  : `No players met the monthly ranking requirements in ${puzzleRankingMonthLabel(effectiveMonth)}.`}
          </InlineState>
        ) : null}

        {leaderboardType === "solvers" && !error && !loading && rows.length > 0 ? (
          <DataTable
            wrapperClassName="rankingsTableWrap puzzleLeaderboardTableWrap"
            className="rankingsTable puzzleLeaderboardTable"
          >
            <thead>
              <tr>
                {puzzleLeaderboardColumns
                  .filter((column) => column.key !== "averageSeconds" || showAverageTime)
                  .map((column) => (
                    <SortableTableHeader
                      key={column.key}
                      accessibleLabel={column.title}
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
                          to="/@/$username/puzzles"
                          params={{ username: row.username }}
                        >
                          {row.username}
                        </Link>
                      </span>
                    </td>
                    <td>{row.leaderboardScore}</td>
                    <td>{row.rating}</td>
                    <td
                      className="puzzleLeaderboardBonus"
                      title={`${row.activityAttempts.toLocaleString()} rated ${row.activityAttempts === 1 ? "attempt" : "attempts"} ${period === "monthly" ? `in ${puzzleRankingMonthLabel(effectiveMonth)}` : "in the last 120 days"}`}
                    >
                      +{row.activityBonus}
                    </td>
                    <td>{row.ratingDeviation}</td>
                    <td>{row.attempted}</td>
                    <td>{row.percentCorrect}%</td>
                    {showAverageTime ? (
                      <td>{row.averageSeconds === null ? "—" : `${row.averageSeconds}s`}</td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        ) : null}

        {leaderboardType === "creators" && !error && !loading && sortedCreatorRows.length > 0 ? (
          <DataTable
            wrapperClassName="rankingsTableWrap puzzleCreatorLeaderboardTableWrap"
            className="rankingsTable puzzleCreatorLeaderboardTable"
          >
            <thead>
              <tr>
                {puzzleCreatorLeaderboardColumns.map(({ key, label, title }) => (
                  <SortableTableHeader
                    key={key}
                    accessibleLabel={title}
                    active={creatorSortKey === key}
                    direction={creatorSortDirection}
                    label={label}
                    onSort={() => changeCreatorSort(key)}
                  />
                ))}
                <th scope="col">Received</th>
                <th scope="col">Given</th>
              </tr>
            </thead>
            <tbody>
              {sortedCreatorRows.map((row) => (
                <tr key={row.username}>
                  <td>{row.rank}</td>
                  <td>
                    <Link
                      className="rankingLink"
                      to="/@/$username/puzzles"
                      params={{ username: row.username }}
                    >
                      {row.username}
                    </Link>
                  </td>
                  <td>
                    <span className="puzzleCreatorKarma">
                      <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                      {row.puzzleKarma}
                    </span>
                  </td>
                  <td>{row.puzzlesCreated}</td>
                  <td>
                    <span className="puzzleCreatorVotePair">
                      <span
                        className="puzzleCreatorVoteValue upvote"
                        aria-label={`${row.upvotesReceived} upvotes received`}
                      >
                        <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                        {row.upvotesReceived}
                      </span>
                      <span
                        className="puzzleCreatorVoteValue downvote"
                        aria-label={`${row.downvotesReceived} downvotes received`}
                      >
                        <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
                        {row.downvotesReceived}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="puzzleCreatorVotePair">
                      <span
                        className="puzzleCreatorVoteValue upvote"
                        aria-label={`${row.upvotesGiven} upvotes given`}
                      >
                        <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                        {row.upvotesGiven}
                      </span>
                      <span
                        className="puzzleCreatorVoteValue downvote"
                        aria-label={`${row.downvotesGiven} downvotes given`}
                      >
                        <FontAwesomeIcon icon={faArrowDown} aria-hidden="true" />
                        {row.downvotesGiven}
                      </span>
                    </span>
                  </td>
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
