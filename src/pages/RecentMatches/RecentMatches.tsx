import "./RecentMatches.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  defaultMode,
  defaultRatingMax,
  defaultRatingMin,
  type Mode,
  modeDescriptions,
  modeLabels,
  modeOptions,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
  type SourceFilters,
} from "../../constants/matches";
import type { MatchFilters as SupabaseMatchFilters } from "../../lib/supabase/supabaseMatchRows";
import type { MatchCardData } from "../../types/matchCard";
import type { RawMatchLike } from "../../types/matchRaw";

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

const isMode = (value: string): value is Mode => (modeOptions as readonly string[]).includes(value);
import { DualRangeSlider } from "../../components/DualRangeSlider/DualRangeSlider";
import { MatchCard } from "../../components/MatchCard/MatchCard";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { Seo } from "../../components/Seo/Seo";
import { SourceFilterChecks } from "../../components/SourceFilterChecks/SourceFilterChecks";
import { TimeControlFields } from "../../components/TimeControlFields/TimeControlFields";
import { useMatchSearch } from "../../hooks/useMatchSearch";
import { loadRawMatchesByMode } from "../../lib/matches/matchData";
import {
  ratingsForPlayers,
  sourceKeyFromMatch,
  sourceValueFromMatch,
  summarizeMatchGames,
} from "../../lib/matches/matchSummaries";
import { resolveUsernameInputs } from "../../lib/users/usernameSearch";
import { getTimeControlOptions } from "../../utils/matchCollection";
import { isSourceAllowedByFilters, parseDateInputBoundary } from "../../utils/matchFilters";
import {
  normalizedGamesFromMatch,
  normalizedPlayersFromMatch,
  parseTimeControlParts,
} from "../../utils/matchTransforms";
import { readStoredSourceFilters, writeStoredSourceFilters } from "../../utils/sourceFilterStorage";

const recentModeOptions = modeOptions;
const ratingFilterTypeOptions = ["both", "average"];
const defaultPageSize = 50;

const normalizeRecentMatches = (
  matches: RawMatchLike[] | null | undefined,
  mode: Mode,
): RecentMatch[] =>
  (Array.isArray(matches) ? matches : [])
    .map((match): RecentMatch => {
      const rawPlayers = normalizedPlayersFromMatch(match);
      const players: string[] =
        rawPlayers.length > 0
          ? rawPlayers.slice(0, 2).map((player) => String(player || "Unknown"))
          : ["Unknown", "Unknown"];
      const playerA = players[0] ?? "Unknown";
      const playerB = players[1] ?? "Unknown";
      const games = normalizedGamesFromMatch(match, players);
      const { scoreA, scoreB, playerAWins, playerBWins, draws, mappedGames } = summarizeMatchGames(
        games,
        playerA,
        playerB,
      );
      const ratings = ratingsForPlayers(match, players, playerA, playerB);

      const firstGame = games[0];
      return {
        matchId: String(match?.["match_id"] ?? ""),
        startTs: Number(match?.["start_ts"] ?? match?.["s"]),
        timeControl: String(match?.["time_control"] ?? match?.["t"] ?? "—"),
        mode,
        playerA,
        playerB,
        scoreA,
        scoreB,
        playerAWins,
        playerBWins,
        draws,
        ...ratings,
        gameCount: games.length,
        firstGameId: String(games[0]?.id || "—"),
        games: mappedGames,
        sourceValue: sourceValueFromMatch(match, firstGame),
        sourceKey: sourceKeyFromMatch(match, firstGame),
      };
    })
    .sort((a, b) => b.startTs - a.startTs);

export const RecentMatchesPage = () => {
  const [selectedMode, setSelectedMode] = useState<Mode>(defaultMode);
  const [matches, setMatches] = useState<RecentMatch[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const { error, loading: loadingMatches, run: runMatchSearch } = useMatchSearch();
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
  const skipNextPageLoadKeyRef = useRef("");
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

  const buildSupabaseFilters = useCallback((nextFilters: AppliedFilters): SupabaseMatchFilters => {
    const queryFilters: SupabaseMatchFilters = {};
    const username = String(nextFilters.player1Filter || nextFilters.player2Filter || "").trim();
    if (username) {
      queryFilters.username = username;
    }
    if (nextFilters.startDateFilter) {
      queryFilters.startTs = parseDateInputBoundary(nextFilters.startDateFilter, "start");
    }
    if (nextFilters.endDateFilter) {
      queryFilters.endTs = parseDateInputBoundary(nextFilters.endDateFilter, "end");
    }
    if (
      nextFilters.timeControlInitialFilter !== "all" &&
      nextFilters.timeControlIncrementFilter !== "all"
    ) {
      queryFilters.timeControl = `${nextFilters.timeControlInitialFilter}+${nextFilters.timeControlIncrementFilter}`;
    }
    const isDefaultRatingRange =
      nextFilters.ratingMin === defaultRatingMin && nextFilters.ratingMax === defaultRatingMax;
    if (!isDefaultRatingRange) {
      queryFilters.ratingFilterType = nextFilters.ratingFilterType;
      queryFilters.ratingMin = nextFilters.ratingMin;
      queryFilters.ratingMax = nextFilters.ratingMax;
    }
    queryFilters.sourceFilters = nextFilters.sourceFilters;
    return queryFilters;
  }, []);

  const resolveSearchFilters = useCallback(
    async (nextFilters: AppliedFilters): Promise<AppliedFilters> => {
      const [resolvedPlayer1Filter, resolvedPlayer2Filter] = await resolveUsernameInputs([
        nextFilters.player1Filter,
        nextFilters.player2Filter,
      ]);

      return {
        ...nextFilters,
        player1Filter: resolvedPlayer1Filter ?? "",
        player2Filter: resolvedPlayer2Filter ?? "",
      };
    },
    [],
  );

  const pageRequestKey = useCallback(
    (
      nextAppliedFilters: AppliedFilters,
      nextPage: number,
      nextPageSize: number = pageSize,
    ): string =>
      JSON.stringify({
        filters: buildSupabaseFilters(nextAppliedFilters),
        mode: nextAppliedFilters.selectedMode,
        page: nextPage,
        pageSize: nextPageSize,
      }),
    [buildSupabaseFilters, pageSize],
  );

  const fetchPage = useCallback(
    async (filters: AppliedFilters, page: number) => {
      const loaded = await loadRawMatchesByMode(filters.selectedMode, {
        filters: buildSupabaseFilters(filters),
        page,
        pageSize,
      });
      return {
        matches: normalizeRecentMatches(loaded.matches, filters.selectedMode),
        total: loaded.total,
      };
    },
    [buildSupabaseFilters, pageSize],
  );

  const handleSearch = async () => {
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

    const result = await runMatchSearch(
      async () => {
        const filters = await resolveSearchFilters(nextAppliedFilters);
        return { filters, ...(await fetchPage(filters, 1)) };
      },
      () => {
        setMatches([]);
        setTotalMatches(0);
        setCurrentPage(1);
      },
    );
    if (!result) return;
    setMatches(result.matches);
    setTotalMatches(result.total);
    skipNextPageLoadKeyRef.current = pageRequestKey(result.filters, 1);
    setAppliedFilters(result.filters);
    setCurrentPage(1);
  };

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const loadPage = async () => {
      const requestKey = pageRequestKey(appliedFilters, currentPage);
      if (skipNextPageLoadKeyRef.current === requestKey) {
        skipNextPageLoadKeyRef.current = "";
        return;
      }

      const result = await runMatchSearch(
        () => fetchPage(appliedFilters, currentPage),
        () => {
          setMatches([]);
          setTotalMatches(0);
        },
      );
      if (!result) return;
      setMatches(result.matches);
      setTotalMatches(result.total);
    };

    void loadPage();
  }, [appliedFilters, currentPage, fetchPage, pageRequestKey, runMatchSearch]);

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
            void handleSearch();
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
