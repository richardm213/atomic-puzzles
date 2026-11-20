import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { DualRangeSlider } from "../../components/DualRangeSlider/DualRangeSlider";
import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { MatchDetails } from "../../components/MatchDetails/MatchDetails";
import { MatchPageLink } from "../../components/MatchPageLink/MatchPageLink";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { SourceFilterChecks } from "../../components/SourceFilterChecks/SourceFilterChecks";
import { TimeControlFields } from "../../components/TimeControlFields/TimeControlFields";
import {
  defaultMode,
  type Mode,
  modeLabels,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
} from "../../constants/matches";
import { isClientSidePagedSearch } from "../../features/profile/profileFilters";
import { type ProfileHistoryTab } from "../../features/profile/profileNavigation";
import { profileResultToneClass } from "../../features/profile/profilePresentation";
import {
  type ProfileMatchHistoryMode,
  profileMatchHistoryQueryOptions,
} from "../../features/profile/profileQueries";
import { filterMatches } from "../../hooks/usePlayerProfileData";
import { getTimeControlOptions } from "../../lib/matches/collection";
import { isOneOf, toggleArrayValue } from "../../utils/arrays";
import { getErrorMessage } from "../../utils/errors";
import {
  formatLocalDateTime,
  formatOpponentWithRating,
  formatScore,
  formatSignedDecimal,
} from "../../utils/formatters";
import { useProfileFilters } from "./useProfileFilters";

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
};

const shouldSkipMatchPrefetch = (): boolean => {
  const connection = (navigator as NavigatorWithConnection).connection;
  return Boolean(
    connection?.saveData ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g",
  );
};

const matchPrefetchDelayMs = 750;
export const ProfileMatchHistory = ({
  profileHistoryTab,
  profileModeOptions,
  normalizedUsername,
  canonicalUsername,
  aliasesLoaded,
  isExcluded,
}: {
  profileHistoryTab: ProfileHistoryTab;
  profileModeOptions: readonly Mode[];
  normalizedUsername: string;
  canonicalUsername: string;
  aliasesLoaded: boolean;
  isExcluded: boolean;
}) => {
  const queryClient = useQueryClient();
  const [matchHistoryMode, setMatchHistoryMode] = useState<ProfileMatchHistoryMode>("all");
  const [expandedMatchKeys, setExpandedMatchKeys] = useState<string[]>([]);
  const [displayedMatchPage, setDisplayedMatchPage] = useState(1);
  const matchHistoryTableRef = useRef<HTMLDivElement>(null);
  const pendingMatchPageScrollRef = useRef<number | null>(null);
  const matchHistoryModeOptions: ProfileMatchHistoryMode[] = ["all", ...profileModeOptions];
  const {
    matchFiltersOpen,
    toggleMatchFilters,
    page,
    setPage,
    pageSize,
    setPageSize,
    appliedFilters,
    applyFilters,
    resetTimeControl,
    opponentRatingMin,
    setOpponentRatingMin,
    opponentRatingMax,
    setOpponentRatingMax,
    opponentFilter,
    setOpponentFilter,
    startDateFilter,
    setStartDateFilter,
    endDateFilter,
    setEndDateFilter,
    sourceFilters,
    setSourceFilter,
    timeControlInitialFilter,
    setTimeControlInitialFilter,
    timeControlIncrementFilter,
    setTimeControlIncrementFilter,
  } = useProfileFilters(`${normalizedUsername}:${String(isExcluded)}`);

  useEffect(() => {
    setMatchHistoryMode("all");
    setExpandedMatchKeys([]);
  }, [isExcluded, normalizedUsername]);
  useEffect(() => {
    if (matchHistoryMode !== "all" && !profileModeOptions.includes(matchHistoryMode))
      setMatchHistoryMode(defaultMode);
  }, [matchHistoryMode, profileModeOptions]);
  useEffect(() => {
    setExpandedMatchKeys([]);
  }, [page, matchHistoryMode, appliedFilters, canonicalUsername]);

  const isClientPagedResults = isClientSidePagedSearch(appliedFilters);
  const matchHistoryQuery = useQuery({
    ...profileMatchHistoryQueryOptions(
      canonicalUsername,
      matchHistoryMode,
      appliedFilters,
      isClientPagedResults ? 1 : page,
      pageSize,
    ),
    enabled: aliasesLoaded && profileHistoryTab === "matches" && Boolean(canonicalUsername),
    placeholderData: keepPreviousData,
  });
  const matches = useMemo(
    () => matchHistoryQuery.data?.matches ?? [],
    [matchHistoryQuery.data?.matches],
  );
  const loadingMatches = matchHistoryQuery.isFetching;
  const error = matchHistoryQuery.error
    ? getErrorMessage(matchHistoryQuery.error, "Unable to load match history.")
    : "";

  const { initialOptions, incrementOptions } = useMemo(
    () => getTimeControlOptions(matches),
    [matches],
  );
  const filteredMatches = useMemo(
    () => filterMatches(matches, appliedFilters),
    [matches, appliedFilters],
  );
  // A new page has no query data while loading (or after a failed request).
  // Only clamp pagination once the requested result supplies a real total.
  const totalPages = Math.max(
    matchHistoryQuery.data === undefined ? page : 1,
    Math.ceil(
      (isClientPagedResults ? filteredMatches.length : (matchHistoryQuery.data?.total ?? 0)) /
        Math.max(1, pageSize),
    ),
  );
  const currentPage = Math.min(page, totalPages);
  const visibleMatches = useMemo(() => {
    if (!isClientPagedResults) return filteredMatches;
    const pageStart = (currentPage - 1) * pageSize;
    return filteredMatches.slice(pageStart, pageStart + pageSize);
  }, [currentPage, filteredMatches, isClientPagedResults, pageSize]);
  const requestedServerPage = isClientPagedResults ? 1 : currentPage;

  useEffect(() => {
    const pageDataReady =
      isClientPagedResults ||
      (matchHistoryQuery.data !== undefined &&
        !matchHistoryQuery.isPlaceholderData &&
        !matchHistoryQuery.isFetching);
    if (!pageDataReady) return;

    setDisplayedMatchPage(currentPage);
    if (pendingMatchPageScrollRef.current === null) return;
    if (pendingMatchPageScrollRef.current !== currentPage) {
      pendingMatchPageScrollRef.current = null;
      return;
    }
    pendingMatchPageScrollRef.current = null;

    const table = matchHistoryTableRef.current;
    if (!table) return;
    const top = Math.max(
      0,
      window.scrollY + table.getBoundingClientRect().top - window.innerHeight * 0.15,
    );
    window.scrollTo({ top, left: 0, behavior: "auto" });
  }, [
    currentPage,
    isClientPagedResults,
    matchHistoryQuery.data,
    matchHistoryQuery.isFetching,
    matchHistoryQuery.isPlaceholderData,
  ]);

  const handleMatchPageChange = (nextPage: number): void => {
    if (nextPage === currentPage || loadingMatches) return;
    pendingMatchPageScrollRef.current = nextPage;
    setPage(nextPage);
  };

  useEffect(() => {
    if (
      matchHistoryQuery.isPending ||
      !aliasesLoaded ||
      isExcluded ||
      matchHistoryMode === "all" ||
      profileHistoryTab !== "matches" ||
      isClientPagedResults ||
      profileModeOptions.length < 2 ||
      shouldSkipMatchPrefetch()
    ) {
      return;
    }

    const currentModeIndex = profileModeOptions.indexOf(matchHistoryMode);
    const nextMode = profileModeOptions[(currentModeIndex + 1) % profileModeOptions.length];
    if (!nextMode || nextMode === matchHistoryMode) return;

    let cancelled = false;
    const prefetch = (): void => {
      if (cancelled) return;
      void queryClient.prefetchQuery(
        profileMatchHistoryQueryOptions(
          canonicalUsername,
          nextMode,
          appliedFilters,
          requestedServerPage,
          pageSize,
        ),
      );
    };

    let idleCallbackId: number | undefined;
    const delayId = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleCallbackId = window.requestIdleCallback(prefetch, { timeout: 2_000 });
      } else {
        prefetch();
      }
    }, matchPrefetchDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(delayId);
      if (idleCallbackId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }
    };
  }, [
    aliasesLoaded,
    appliedFilters,
    canonicalUsername,
    isExcluded,
    isClientPagedResults,
    matchHistoryQuery.isPending,
    matchHistoryMode,
    pageSize,
    profileHistoryTab,
    profileModeOptions,
    queryClient,
    requestedServerPage,
  ]);

  const handleSearchClick = () => {
    if (loadingMatches) return;
    applyFilters();
  };
  const handleModeChange = (nextMode: ProfileMatchHistoryMode): void => {
    setMatchHistoryMode(nextMode);
    resetTimeControl();
  };
  useEffect(() => {
    if (currentPage !== page) {
      setPage(currentPage);
    }
  }, [currentPage, page, setPage]);

  const toggleMatchKey = (key: string): void => {
    setExpandedMatchKeys((current) => toggleArrayValue(current, key));
  };
  return (
    <section
      id="profile-match-history-panel"
      className="profileHistorySection"
      role="tabpanel"
      aria-labelledby="profile-match-history-tab"
      hidden={profileHistoryTab !== "matches"}
    >
      {profileHistoryTab === "matches" ? (
        <>
          <div className="rankingsMeta profileHistoryMeta">
            <div className="profileHistoryTitleControl">
              <label htmlFor="profile-match-history-mode-select">
                <span>Mode</span>
                <select
                  id="profile-match-history-mode-select"
                  aria-label="Match history mode"
                  value={matchHistoryMode}
                  onChange={(event) => {
                    const v = event.target.value;
                    if (isOneOf(matchHistoryModeOptions, v)) {
                      handleModeChange(v);
                    }
                  }}
                >
                  {matchHistoryModeOptions.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode === "all" ? "All" : (modeLabels[mode] ?? mode)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              className="profileMatchFilterToggle"
              aria-expanded={matchFiltersOpen}
              aria-controls="profile-match-filters"
              onClick={toggleMatchFilters}
            >
              {matchFiltersOpen ? "Hide filters" : "Show filters"}
            </button>
          </div>

          {matchFiltersOpen ? (
            <form
              id="profile-match-filters"
              className="matchFilterPanel profileMatchFilters"
              onSubmit={(event) => {
                event.preventDefault();
                handleSearchClick();
              }}
            >
              <div className="matchFilterGrid">
                <label htmlFor="profile-page-size-select">
                  Page size
                  <select
                    id="profile-page-size-select"
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                  >
                    {pageSizeOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <TimeControlFields
                  initialId="profile-time-initial-select"
                  incrementId="profile-time-increment-select"
                  initialValue={timeControlInitialFilter}
                  incrementValue={timeControlIncrementFilter}
                  initialOptions={initialOptions}
                  incrementOptions={incrementOptions}
                  onInitialChange={setTimeControlInitialFilter}
                  onIncrementChange={setTimeControlIncrementFilter}
                  startDateId="profile-start-date-filter"
                  endDateId="profile-end-date-filter"
                  startDateValue={startDateFilter}
                  endDateValue={endDateFilter}
                  onStartDateChange={setStartDateFilter}
                  onEndDateChange={setEndDateFilter}
                />
                <label htmlFor="profile-opponent-filter" className="profileOpponentFilterField">
                  Opponent
                  <input
                    id="profile-opponent-filter"
                    type="text"
                    value={opponentFilter}
                    onChange={(event) => setOpponentFilter(event.target.value)}
                    placeholder="username"
                  />
                </label>
              </div>

              {!isExcluded ? (
                <div className="matchFilterRanges">
                  <DualRangeSlider
                    id="opponent-rating-min"
                    label={`Opponent rating range: ${opponentRatingMin} - ${opponentRatingMax}`}
                    min={opponentRatingSliderMin}
                    max={opponentRatingSliderMax}
                    step={10}
                    lowerValue={opponentRatingMin}
                    upperValue={opponentRatingMax}
                    onLowerChange={setOpponentRatingMin}
                    onUpperChange={setOpponentRatingMax}
                  />
                </div>
              ) : null}

              <div className="matchFilterFooter profileMatchFilterFooter">
                <SourceFilterChecks values={sourceFilters} onChange={setSourceFilter} />
                <div className="matchFilterActions">
                  <button
                    className="primaryActionButton matchFilterSearch"
                    type="submit"
                    disabled={loadingMatches}
                  >
                    <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
                    {loadingMatches ? "Searching..." : "Search"}
                  </button>
                </div>
              </div>
            </form>
          ) : null}

          {error ? <div className="errorText">{error}</div> : null}

          <div
            ref={matchHistoryTableRef}
            className="rankingsTableWrap matchHistoryTableWrap profileMatchTableWrap"
          >
            <table className="rankingsTable matchHistoryTable profileMatchTable">
              <colgroup>
                <col className="profileMatchDateColumn" />
                <col className="profileMatchOpponentColumn" />
                <col className="profileMatchTimeControlColumn" />
                <col className="profileMatchScoreColumn" />
                <col className="profileMatchRatingColumn" />
                <col className="profileMatchRdColumn" />
                <col className="profileMatchLinkColumn" />
              </colgroup>
              <thead>
                <tr>
                  <th>Date / Time</th>
                  <th>Opponent</th>
                  <th>TC</th>
                  <th>Score</th>
                  <th>{isExcluded ? "Estimated rating (Δ)" : "Rating (Δ)"}</th>
                  <th>RD (Δ)</th>
                  <th aria-label="Match actions" />
                </tr>
              </thead>
              <tbody>
                {visibleMatches.map((match) => {
                  const matchKey = `${match.startTs}-${match.firstGameId}`;
                  const isExpanded = expandedMatchKeys.includes(matchKey);
                  return (
                    <Fragment key={matchKey}>
                      <tr
                        className={`expandableMatchRow${isExpanded ? " expanded" : ""}`}
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        onClick={(event) => {
                          if ((event.target as HTMLElement).closest("a, button")) return;
                          toggleMatchKey(matchKey);
                        }}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          toggleMatchKey(matchKey);
                        }}
                      >
                        <td>
                          <LichessGameLink
                            gameId={match.firstGameId}
                            source={match.sourceValue}
                            mode={match.mode}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {formatLocalDateTime(match.startTs)}
                          </LichessGameLink>
                        </td>
                        <td>
                          <PlayerLink
                            className="rankingLink"
                            username={match.opponent}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {formatOpponentWithRating(match.opponent, match.opponentAfterRating)}
                          </PlayerLink>
                        </td>
                        <td>
                          <span className="profileTablePill timeControlValue">
                            {match.timeControl}
                          </span>
                        </td>
                        <td className="scoreCell">
                          <span className="profileScoreBox">
                            <span
                              className={`profileScoreValue${profileResultToneClass(
                                match.playerScore,
                                match.opponentScore,
                              )}`}
                            >
                              {formatScore(match.playerScore)}
                            </span>
                            <span className="scoreDash">-</span>
                            <span className="profileScoreValue">
                              {formatScore(match.opponentScore)}
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className="profileMetricPair">
                            <span className="profileMetricValue">{match.beforeRating}</span>
                            <span className="profileDelta">
                              {formatSignedDecimal(match.ratingChange)}
                            </span>
                          </span>
                        </td>
                        <td>
                          <span className="profileMetricPair">
                            <span className="profileMetricValue">{match.beforeRd}</span>
                            <span className="profileDelta">
                              {formatSignedDecimal(match.rdChange)}
                            </span>
                          </span>
                        </td>
                        <td>
                          <div className="tableRowActions">
                            <MatchPageLink
                              match={{
                                ...match,
                                playerA: canonicalUsername,
                                playerB: match.opponent,
                                mode: match.mode,
                              }}
                              title="Open match page in new tab"
                            />
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="matchDetailsRow">
                          <td colSpan={7}>
                            <div className="matchDetailsInner">
                              <MatchDetails
                                match={{
                                  matchId: match.matchId,
                                  mode: match.mode,
                                  playerA: canonicalUsername,
                                  playerB: match.opponent,
                                  startTs: match.startTs,
                                  timeControl: match.timeControl,
                                  sourceValue: match.sourceValue,
                                  firstGameId: match.firstGameId,
                                  scoreA: match.playerScore,
                                  scoreB: match.opponentScore,
                                  playerABeforeRating: match.beforeRating,
                                  playerAAfterRating: match.afterRating,
                                  playerABeforeRd: match.beforeRd,
                                  playerAAfterRd: match.afterRd,
                                  playerBBeforeRating: match.opponentBeforeRating,
                                  playerBAfterRating: match.opponentAfterRating,
                                  playerBBeforeRd: match.opponentBeforeRd,
                                  playerBAfterRd: match.opponentAfterRd,
                                  games: match.games.map((game, index) => ({
                                    id: game.id,
                                    index,
                                    resultLabel: game.winner,
                                    scoreAAfter: game.playerScoreAfter,
                                    scoreBAfter: game.opponentScoreAfter,
                                  })),
                                }}
                                matchKey={matchKey}
                                showH2HLink
                                showRunningScore
                                stopPropagation={(event) => event.stopPropagation()}
                              />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
                {visibleMatches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="emptyRankings">
                      {matchHistoryMode === "all"
                        ? "No matches found for this player with current filters across all modes."
                        : `No matches found for this player with current filters in ${modeLabels[matchHistoryMode]}.`}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <PaginationRow
            currentPage={displayedMatchPage}
            totalPages={totalPages}
            onPageChange={handleMatchPageChange}
            formatLabel={(current, total) => `Page ${current} / ${total}`}
            disabled={loadingMatches}
            navigationVariant="arrows"
          />
        </>
      ) : null}
    </section>
  );
};
