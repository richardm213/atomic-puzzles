import "./RecentMatches.css";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  defaultMode,
  defaultRatingMax,
  defaultRatingMin,
  isMode,
  type Mode,
  modeDescriptions,
  modeLabels,
  modeOptions,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
  type SourceFilters,
} from "../../constants/matches";
import type { MatchFilters as ArchiveMatchFilters } from "../../lib/archive/matches";
import type { MatchCardData } from "../../lib/matches/types";
import type { RawMatchLike } from "../../lib/matches/types";

type RecentMatch = MatchCardData & {
  sourceKey: string;
};

type AppliedFilters = {
  selectedMode: Mode;
  ratingFilterType: string;
  ratingMin: number;
  ratingMax: number;
  player1Filter: string;
  player2Filter: string;
  sourceFilters: SourceFilters;
  startDateFilter: string;
  endDateFilter: string;
  timeControlInitialFilter: string;
  timeControlIncrementFilter: string;
};

import { DualRangeSlider } from "../../components/DualRangeSlider/DualRangeSlider";
import { MatchCard } from "../../components/MatchCard/MatchCard";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { Seo } from "../../components/Seo/Seo";
import { SourceFilterChecks } from "../../components/SourceFilterChecks/SourceFilterChecks";
import { TimeControlFields } from "../../components/TimeControlFields/TimeControlFields";
import { getTimeControlOptions } from "../../lib/matches/collection";
import { toMatchCardData } from "../../lib/matches/data";
import { isSourceAllowedByFilters, parseDateInputBoundary } from "../../lib/matches/filters";
import { recentMatchesPageQueryOptions } from "../../lib/matches/queries";
import {
  readStoredSourceFilters,
  writeStoredSourceFilters,
} from "../../lib/matches/sourceFilterStorage";
import { parseTimeControlParts } from "../../lib/matches/transforms";
import { resolveUsernameInputs } from "../../lib/users/usernameSearch";

const recentModeOptions = modeOptions;
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
  const username = String(filters.player1Filter || filters.player2Filter || "").trim();
  if (username) queryFilters.username = username;
  if (filters.startDateFilter) {
    queryFilters.startTs = parseDateInputBoundary(filters.startDateFilter, "start");
  }
  if (filters.endDateFilter) {
    queryFilters.endTs = parseDateInputBoundary(filters.endDateFilter, "end");
  }
  if (filters.timeControlInitialFilter !== "all" && filters.timeControlIncrementFilter !== "all") {
    queryFilters.timeControl = `${filters.timeControlInitialFilter}+${filters.timeControlIncrementFilter}`;
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
    ),
    select: (loaded) =>
      ({
        matches: normalizeRecentMatches(loaded.matches, appliedFilters.selectedMode),
        total: loaded.total,
      }) satisfies { matches: RecentMatch[]; total: number },
    placeholderData: keepPreviousData,
  });
  const applyFiltersMutation = useMutation({
    mutationFn: resolveSearchFilters,
    onSuccess: (filters) => {
      setAppliedFilters(filters);
      setCurrentPage(1);
    },
  });
  const matches = useMemo(() => matchesQuery.data?.matches ?? [], [matchesQuery.data?.matches]);
  const totalMatches = matchesQuery.data?.total ?? 0;
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

  const startDateTs = useMemo(
    () => parseDateInputBoundary(appliedFilters.startDateFilter, "start"),
    [appliedFilters.startDateFilter],
  );
  const endDateTs = useMemo(
    () => parseDateInputBoundary(appliedFilters.endDateFilter, "end"),
    [appliedFilters.endDateFilter],
  );
  const { initialOptions, incrementOptions } = useMemo(
    () => getTimeControlOptions(matches),
    [matches],
  );

  useEffect(() => {
    setTimeControlInitialFilter("all");
    setTimeControlIncrementFilter("all");
  }, [selectedMode]);

  const filteredMatches = useMemo(
    () =>
      matches.filter((match) => {
        if (match.startTs < startDateTs || match.startTs > endDateTs) return false;

        const { initial, increment } = parseTimeControlParts(match.timeControl);
        if (
          appliedFilters.timeControlInitialFilter !== "all" &&
          initial !== appliedFilters.timeControlInitialFilter
        ) {
          return false;
        }
        if (
          appliedFilters.timeControlIncrementFilter !== "all" &&
          increment !== appliedFilters.timeControlIncrementFilter
        ) {
          return false;
        }

        const playerAName = match.playerA.toLowerCase();
        const playerBName = match.playerB.toLowerCase();
        const first = appliedFilters.player1Filter.trim().toLowerCase();
        const second = appliedFilters.player2Filter.trim().toLowerCase();

        if (first && second) {
          const firstFound = playerAName.includes(first) || playerBName.includes(first);
          const secondFound = playerAName.includes(second) || playerBName.includes(second);
          if (!firstFound || !secondFound) return false;
        } else if (first || second) {
          const onlyFilter = first || second;
          if (!playerAName.includes(onlyFilter) && !playerBName.includes(onlyFilter)) {
            return false;
          }
        }

        return isSourceAllowedByFilters(match.sourceKey, appliedFilters.sourceFilters);
      }),
    [matches, appliedFilters, startDateTs, endDateTs],
  );
  const totalPages = Math.max(1, Math.ceil(totalMatches / Math.max(1, pageSize)));

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

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paginatedMatches = filteredMatches;
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
        description="Filter recent atomic chess matches by player, rating, source, date, time control, and match length across blitz, bullet, and hyperbullet."
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
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {pageSizeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <TimeControlFields
              initialId="recent-time-initial-select"
              incrementId="recent-time-increment-select"
              initialValue={timeControlInitialFilter}
              incrementValue={timeControlIncrementFilter}
              initialOptions={initialOptions}
              incrementOptions={incrementOptions}
              onInitialChange={setTimeControlInitialFilter}
              onIncrementChange={setTimeControlIncrementFilter}
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

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta">
          <span>Showing recent matches</span>
          <span>
            {filteredMatches.length === 0
              ? "0 shown"
              : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredMatches.length)} shown`}
          </span>
        </div>

        <div className="matchCards">
          {paginatedMatches.map((match) => {
            const matchKey = `${match.startTs}-${match.firstGameId}-${match.playerA}-${match.playerB}`;
            const isExpanded = expandedMatchKeys.includes(matchKey);

            return (
              <MatchCard
                key={matchKey}
                match={match}
                matchKey={matchKey}
                isExpanded={isExpanded}
                onToggle={() =>
                  setExpandedMatchKeys((current) =>
                    current.includes(matchKey)
                      ? current.filter((key) => key !== matchKey)
                      : [...current, matchKey],
                  )
                }
              />
            );
          })}
          {filteredMatches.length === 0 ? (
            <div className="emptyRankings">No matches found with current filters.</div>
          ) : null}
        </div>
        {filteredMatches.length > 0 ? (
          <PaginationRow
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            disabled={loadingMatches}
          />
        ) : null}
      </div>
    </div>
  );
};
