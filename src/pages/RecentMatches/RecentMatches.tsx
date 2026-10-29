import "../../components/MatchHistoryTable/MatchHistoryTable.css";
import "./RecentMatches.css";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";

import {
  defaultMode,
  defaultRatingMax,
  defaultRatingMin,
  isMode,
  type Mode,
  modeDescriptions,
  modeLabels,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
  publicModeOptions,
  type SourceFilters,
} from "../../constants/matches";
import type { MatchFilters as ArchiveMatchFilters } from "../../lib/archive/matches";
import type { MatchListFilters } from "../../lib/matches/filters";
import type { MatchCardData } from "../../lib/matches/types";
import type { RawMatchLike } from "../../lib/matches/types";

type RecentMatch = MatchCardData & {
  sourceKey: string;
};

type AppliedFilters = MatchListFilters & {
  selectedMode: Mode;
  ratingFilterType: string;
  ratingMin: number;
  ratingMax: number;
  player1Filter: string;
  player2Filter: string;
};

import { DualRangeSlider } from "../../components/DualRangeSlider/DualRangeSlider";
import { InlineState } from "../../components/InlineState/InlineState";
import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { MatchDetails } from "../../components/MatchDetails/MatchDetails";
import { MatchPageLink } from "../../components/MatchPageLink/MatchPageLink";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { Seo } from "../../components/Seo/Seo";
import { SourceFilterChecks } from "../../components/SourceFilterChecks/SourceFilterChecks";
import { TimeControlFields } from "../../components/TimeControlFields/TimeControlFields";
import { toMatchCardData } from "../../lib/matches/data";
import { parseDateInputBoundary } from "../../lib/matches/filters";
import { recentMatchesPageQueryOptions } from "../../lib/matches/queries";
import {
  readStoredSourceFilters,
  writeStoredSourceFilters,
} from "../../lib/matches/sourceFilterStorage";
import { resolveUsernameInputs } from "../../lib/users/usernameSearch";
import { toggleArrayValue } from "../../utils/arrays";
import { formatLocalDateTime, formatScore } from "../../utils/formatters";

const recentModeOptions = publicModeOptions;
const ratingFilterTypeOptions = ["both", "average"];
const defaultPageSize = 50;

const normalizeRecentMatches = (
  matches: RawMatchLike[] | null | undefined,
  mode: Mode,
): RecentMatch[] =>
  (Array.isArray(matches) ? matches : [])
    .map((match): RecentMatch => {
      return toMatchCardData(match, mode);
    })
    .sort((a, b) => b.startTs - a.startTs);

const buildArchiveFilters = (filters: AppliedFilters): ArchiveMatchFilters => {
  const queryFilters: ArchiveMatchFilters = {};
  const player1 = filters.player1Filter.trim();
  const player2 = filters.player2Filter.trim();
  if (player1 && player2) queryFilters.usernamePair = [player1, player2];
  else if (player1 || player2) queryFilters.username = player1 || player2;
  if (filters.startDateFilter) {
    queryFilters.startTs = parseDateInputBoundary(filters.startDateFilter, "start");
  }
  if (filters.endDateFilter) {
    queryFilters.endTs = parseDateInputBoundary(filters.endDateFilter, "end");
  }
  if (filters.timeControlInitialFilter !== "all") {
    queryFilters.timeControlInitial = String(Number(filters.timeControlInitialFilter));
  }
  if (filters.timeControlIncrementFilter !== "all") {
    queryFilters.timeControlIncrement = String(Number(filters.timeControlIncrementFilter));
  }
  const isDefaultRatingRange =
    filters.ratingMin === defaultRatingMin && filters.ratingMax === defaultRatingMax;
  if (!isDefaultRatingRange) {
    queryFilters.ratingFilterType = filters.ratingFilterType;
    queryFilters.ratingMin = filters.ratingMin;
    queryFilters.ratingMax = filters.ratingMax;
  }
  queryFilters.sourceFilters = filters.sourceFilters;
  return queryFilters;
};

const resolveSearchFilters = async (filters: AppliedFilters): Promise<AppliedFilters> => {
  const [player1Filter, player2Filter] = await resolveUsernameInputs([
    filters.player1Filter,
    filters.player2Filter,
  ]);
  return { ...filters, player1Filter: player1Filter ?? "", player2Filter: player2Filter ?? "" };
};

export const RecentMatchesPage = () => {
  const [selectedMode, setSelectedMode] = useState<Mode>(defaultMode);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [knownTotal, setKnownTotal] = useState<number | null>(null);
  const [expandedMatchKeys, setExpandedMatchKeys] = useState<string[]>([]);
  const [ratingFilterType, setRatingFilterType] = useState("both");
  const [ratingMin, setRatingMin] = useState(defaultRatingMin);
  const [ratingMax, setRatingMax] = useState(defaultRatingMax);
  const [player1Filter, setPlayer1Filter] = useState("");
  const [player2Filter, setPlayer2Filter] = useState("");
  const [sourceFilters, setSourceFilters] = useState(readStoredSourceFilters);
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [timeControlInitialFilter, setTimeControlInitialFilter] = useState("all");
  const [timeControlIncrementFilter, setTimeControlIncrementFilter] = useState("all");
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>({
    selectedMode: defaultMode,
    ratingFilterType: "both",
    ratingMin: defaultRatingMin,
    ratingMax: defaultRatingMax,
    player1Filter: "",
    player2Filter: "",
    sourceFilters: readStoredSourceFilters(),
    startDateFilter: "",
    endDateFilter: "",
    timeControlInitialFilter: "all",
    timeControlIncrementFilter: "all",
  });
  const archiveFilters = useMemo(() => buildArchiveFilters(appliedFilters), [appliedFilters]);
  const matchesQuery = useQuery({
    ...recentMatchesPageQueryOptions(
      appliedFilters.selectedMode,
      archiveFilters,
      currentPage,
      pageSize,
      knownTotal === null,
    ),
    select: (loaded) =>
      ({
        matches: normalizeRecentMatches(loaded.matches, appliedFilters.selectedMode),
        total: knownTotal ?? loaded.total,
        hasPreviousPage: loaded.hasPreviousPage,
        hasNextPage: loaded.hasNextPage,
      }) satisfies {
        matches: RecentMatch[];
        total: number;
        hasPreviousPage: boolean;
        hasNextPage: boolean;
      },
    placeholderData: keepPreviousData,
  });
  const applyFiltersMutation = useMutation({
    mutationFn: resolveSearchFilters,
    onSuccess: (filters) => {
      setKnownTotal(null);
      setAppliedFilters(filters);
      setCurrentPage(1);
    },
  });
  const matches = useMemo(() => matchesQuery.data?.matches ?? [], [matchesQuery.data?.matches]);
  const totalMatches = knownTotal ?? matchesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalMatches / pageSize));
  const loadingMatches = matchesQuery.isFetching || applyFiltersMutation.isPending;
  const queryError = matchesQuery.error ?? applyFiltersMutation.error;
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : String(queryError)
    : "";

  useEffect(() => {
    setExpandedMatchKeys([]);
  }, [currentPage, appliedFilters]);

  useEffect(() => {
    if (knownTotal === null && matchesQuery.data && !matchesQuery.isPlaceholderData) {
      setKnownTotal(matchesQuery.data.total);
    }
  }, [knownTotal, matchesQuery.data, matchesQuery.isPlaceholderData]);

  useEffect(() => {
    setTimeControlInitialFilter("all");
    setTimeControlIncrementFilter("all");
  }, [selectedMode]);

  const handleSearch = () => {
    if (loadingMatches) return;

    const nextAppliedFilters = {
      selectedMode,
      ratingFilterType,
      ratingMin,
      ratingMax,
      player1Filter,
      player2Filter,
      sourceFilters: { ...sourceFilters },
      startDateFilter,
      endDateFilter,
      timeControlInitialFilter,
      timeControlIncrementFilter,
    };

    applyFiltersMutation.mutate(nextAppliedFilters);
  };

  const paginatedMatches = matches;
  const setSourceFilter = (source: keyof SourceFilters, checked: boolean): void => {
    setSourceFilters((current) => {
      const next = { ...current, [source]: checked };
      writeStoredSourceFilters(next);
      return next;
    });
  };

  return (
    <div className="rankingsPage">
      <Seo
        title="Recent Match Archive"
        description="Filter atomic chess matches by mode, player, rating, source, date, time control, and match length."
        path="/recent"
      />
      <div className="panel rankingsPanel recentMatchesPanel">
        <h1>Recent Match Archive</h1>
        <form
          className="matchFilterPanel"
          onSubmit={(event) => {
            event.preventDefault();
            handleSearch();
          }}
        >
          <div className="matchFilterGrid">
            <label htmlFor="recent-mode-select">
              Mode
              <select
                id="recent-mode-select"
                value={selectedMode}
                onChange={(event) => {
                  if (isMode(event.target.value)) setSelectedMode(event.target.value);
                }}
              >
                {recentModeOptions.map((mode) => (
                  <option key={mode} value={mode}>
                    {modeLabels[mode] ?? mode}
                  </option>
                ))}
              </select>
              <span className="controlHint">{modeDescriptions[selectedMode]}</span>
            </label>
            <label htmlFor="recent-page-size">
              Page size
              <select
                id="recent-page-size"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setCurrentPage(1);
                }}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <TimeControlFields
              initialId="recent-time-initial"
              incrementId="recent-time-increment"
              initialValue={timeControlInitialFilter}
              incrementValue={timeControlIncrementFilter}
              onInitialChange={setTimeControlInitialFilter}
              onIncrementChange={setTimeControlIncrementFilter}
              controlStyle="compact-input"
              startDateId="recent-start-date-filter"
              endDateId="recent-end-date-filter"
              startDateValue={startDateFilter}
              endDateValue={endDateFilter}
              onStartDateChange={setStartDateFilter}
              onEndDateChange={setEndDateFilter}
            />
            <label htmlFor="recent-rating-filter-type">
              Rating type
              <select
                id="recent-rating-filter-type"
                value={ratingFilterType}
                onChange={(event) => setRatingFilterType(event.target.value)}
              >
                {ratingFilterTypeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "both" ? "Both players" : "Average"}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="recent-player1-filter">
              Player 1
              <input
                id="recent-player1-filter"
                type="text"
                value={player1Filter}
                onChange={(event) => setPlayer1Filter(event.target.value)}
                placeholder="username"
              />
            </label>
            <label htmlFor="recent-player2-filter">
              Player 2
              <input
                id="recent-player2-filter"
                type="text"
                value={player2Filter}
                onChange={(event) => setPlayer2Filter(event.target.value)}
                placeholder="username"
              />
            </label>
          </div>

          <div className="matchFilterRanges">
            <DualRangeSlider
              id="recent-rating-min"
              label={`${ratingFilterType === "both" ? "Both-player rating range" : "Average rating range"}: ${ratingMin} - ${ratingMax}`}
              min={opponentRatingSliderMin}
              max={opponentRatingSliderMax}
              step={10}
              lowerValue={ratingMin}
              upperValue={ratingMax}
              onLowerChange={setRatingMin}
              onUpperChange={setRatingMax}
            />
          </div>

          <div className="matchFilterFooter">
            <SourceFilterChecks values={sourceFilters} onChange={setSourceFilter} />
            <div className="matchFilterActions">
              <button
                className="analyzeButton matchFilterSearch"
                type="submit"
                disabled={loadingMatches}
              >
                {loadingMatches ? "Searching..." : "Search"}
              </button>
            </div>
          </div>
        </form>

        {error ? <InlineState kind="error">{error}</InlineState> : null}

        <div className="rankingsTableWrap matchHistoryTableWrap recentMatchTableWrap">
          <table className="rankingsTable matchHistoryTable recentMatchTable">
            <colgroup>
              <col className="recentMatchDateColumn" />
              <col className="recentMatchPlayersColumn" />
              <col className="recentMatchTimeControlColumn" />
              <col className="recentMatchScoreColumn" />
              <col className="recentMatchActionsColumn" />
            </colgroup>
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Players</th>
                <th>TC</th>
                <th>Score</th>
                <th aria-label="Match actions" />
              </tr>
            </thead>
            <tbody>
              {paginatedMatches.map((match) => {
                const matchKey = `${match.startTs}-${match.firstGameId}-${match.playerA}-${match.playerB}`;
                const isExpanded = expandedMatchKeys.includes(matchKey);
                const toggleMatch = () =>
                  setExpandedMatchKeys((current) => toggleArrayValue(current, matchKey));

                return (
                  <Fragment key={matchKey}>
                    <tr
                      className={`expandableMatchRow${isExpanded ? " expanded" : ""}`}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest("a, button")) return;
                        toggleMatch();
                      }}
                    >
                      <td>
                        <LichessGameLink gameId={match.firstGameId} source={match.sourceValue}>
                          {formatLocalDateTime(match.startTs)}
                        </LichessGameLink>
                      </td>
                      <td>
                        <div className="recentMatchPlayers">
                          <PlayerLink className="rankingLink" username={match.playerA}>
                            {match.playerA}
                          </PlayerLink>
                          <span>vs</span>
                          <PlayerLink className="rankingLink" username={match.playerB}>
                            {match.playerB}
                          </PlayerLink>
                        </div>
                      </td>
                      <td>
                        <span className="recentTimeControl timeControlValue">
                          {match.timeControl ?? "—"}
                        </span>
                      </td>
                      <td className="scoreCell recentScoreCell">
                        <span className="profileScoreBox recentScoreBox">
                          <span>{formatScore(match.scoreA)}</span>
                          <span className="scoreDash">-</span>
                          <span>{formatScore(match.scoreB)}</span>
                        </span>
                      </td>
                      <td>
                        <div className="tableRowActions">
                          <button
                            type="button"
                            className="recentRowToggle"
                            aria-expanded={isExpanded}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleMatch();
                            }}
                          >
                            {isExpanded ? "Hide details" : "Show details"}
                          </button>
                          <MatchPageLink match={match} title="Open match page in new tab" />
                        </div>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="matchDetailsRow">
                        <td colSpan={5}>
                          <div className="matchDetailsInner">
                            <MatchDetails
                              match={match}
                              matchKey={matchKey}
                              showH2HLink
                              showRunningScore
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {matches.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <InlineState kind="empty">No matches found with current filters.</InlineState>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {totalMatches > 0 ? (
          <PaginationRow
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            disabled={loadingMatches}
            ariaLabel="Recent match pages"
          />
        ) : null}
      </div>
    </div>
  );
};
