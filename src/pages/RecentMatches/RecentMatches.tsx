import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./RecentMatches.css";
import {
  defaultMode,
  defaultRatingMax,
  defaultRatingMin,
  defaultSourceFilters,
  isMatchLengthWithinBounds,
  knownSourceKeys,
  modeDescriptions,
  modeLabels,
  modeOptions,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
  type Mode,
  type SourceFilters,
} from "../../constants/matches";
import type { MatchCardData } from "../../types/matchCard";
import type { MatchFilters as SupabaseMatchFilters } from "../../lib/supabase/supabaseMatchRows";
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
  matchLengthMin: number;
  matchLengthMax: number;
};

const isMode = (value: string): value is Mode =>
  (modeOptions as readonly string[]).includes(value);
import { toBoundedLengthRange, useMatchLengthRange } from "../../hooks/useMatchLengthRange";
import { MatchCard } from "../../components/MatchCard/MatchCard";
import { DualRangeSlider } from "../../components/DualRangeSlider/DualRangeSlider";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { SourceFilterChecks } from "../../components/SourceFilterChecks/SourceFilterChecks";
import { TimeControlFields } from "../../components/TimeControlFields/TimeControlFields";
import {
  normalizedGamesFromMatch,
  normalizedPlayersFromMatch,
  parseTimeControlParts,
} from "../../utils/matchTransforms";
import { parseDateInputBoundary } from "../../utils/matchFilters";
import {
  ratingsForPlayers,
  sourceKeyFromMatch,
  sourceValueFromMatch,
  summarizeMatchGames,
} from "../../lib/matches/matchSummaries";
import { loadRawMatchesByMode } from "../../lib/matches/matchData";
import { resolveUsernameInputs } from "../../lib/users/usernameSearch";
import { getTimeControlOptions } from "../../utils/matchCollection";
import { Seo } from "../../components/Seo/Seo";

const recentModeOptions = modeOptions;
const ratingFilterTypeOptions = ["both", "average"];
const defaultPageSize = 50;

const normalizeRecentMatches = (matches: RawMatchLike[] | null | undefined, mode: Mode): RecentMatch[] =>
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
  const [error, setError] = useState("");
  const [expandedMatchKeys, setExpandedMatchKeys] = useState<string[]>([]);
  const [ratingFilterType, setRatingFilterType] = useState("both");
  const [ratingMin, setRatingMin] = useState(defaultRatingMin);
  const [ratingMax, setRatingMax] = useState(defaultRatingMax);
  const [player1Filter, setPlayer1Filter] = useState("");
  const [player2Filter, setPlayer2Filter] = useState("");
  const [sourceFilters, setSourceFilters] = useState(defaultSourceFilters);
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [timeControlInitialFilter, setTimeControlInitialFilter] = useState("all");
  const [timeControlIncrementFilter, setTimeControlIncrementFilter] = useState("all");
  const [loadingMatches, setLoadingMatches] = useState(false);
  const searchInFlightRef = useRef(false);
  const pageLoadIdRef = useRef(0);
  const skipNextPageLoadKeyRef = useRef("");
  const defaultLengthRange = useMemo(() => toBoundedLengthRange(defaultMode), []);
  const {
    bounds: appliedMatchBounds,
    matchLengthMin,
    setMatchLengthMin,
    matchLengthMax,
    setMatchLengthMax,
  } = useMatchLengthRange(selectedMode);
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>({
    selectedMode: defaultMode,
    ratingFilterType: "both",
    ratingMin: defaultRatingMin,
    ratingMax: defaultRatingMax,
    player1Filter: "",
    player2Filter: "",
    sourceFilters: defaultSourceFilters,
    startDateFilter: "",
    endDateFilter: "",
    timeControlInitialFilter: "all",
    timeControlIncrementFilter: "all",
    matchLengthMin: defaultLengthRange.min,
    matchLengthMax: defaultLengthRange.max,
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

        if (
          !isMatchLengthWithinBounds(
            match.gameCount ?? 0,
            appliedFilters.matchLengthMin,
            appliedFilters.matchLengthMax,
            appliedMatchBounds.max,
          )
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

        const sourceKey = String(match.sourceKey || "unknown").toLowerCase();
        const anyKnownSourceEnabled = Object.values(appliedFilters.sourceFilters).some(Boolean);
        if (sourceKey === "unknown") return anyKnownSourceEnabled;
        if ((knownSourceKeys as string[]).includes(sourceKey))
          return Boolean(appliedFilters.sourceFilters[sourceKey as keyof SourceFilters]);

        return true;
      }),
    [matches, appliedFilters, startDateTs, endDateTs, appliedMatchBounds.max],
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
    return queryFilters;
  }, []);

  const resolveSearchFilters = useCallback(async (nextFilters: AppliedFilters): Promise<AppliedFilters> => {
    const [resolvedPlayer1Filter, resolvedPlayer2Filter] = await resolveUsernameInputs([
      nextFilters.player1Filter,
      nextFilters.player2Filter,
    ]);

    return {
      ...nextFilters,
      player1Filter: resolvedPlayer1Filter ?? "",
      player2Filter: resolvedPlayer2Filter ?? "",
    };
  }, []);

  const pageRequestKey = useCallback(
    (nextAppliedFilters: AppliedFilters, nextPage: number, nextPageSize: number = pageSize): string =>
      JSON.stringify({
        filters: buildSupabaseFilters(nextAppliedFilters),
        mode: nextAppliedFilters.selectedMode,
        page: nextPage,
        pageSize: nextPageSize,
      }),
    [buildSupabaseFilters, pageSize],
  );

  const handleSearch = async () => {
    if (searchInFlightRef.current || loadingMatches) return;

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
      matchLengthMin,
      matchLengthMax,
    };

    searchInFlightRef.current = true;
    const requestId = pageLoadIdRef.current + 1;
    pageLoadIdRef.current = requestId;
    setLoadingMatches(true);
    setError("");
    try {
      const resolvedAppliedFilters = await resolveSearchFilters(nextAppliedFilters);
      if (requestId !== pageLoadIdRef.current) return;

      const loaded = await loadRawMatchesByMode(selectedMode, {
        filters: buildSupabaseFilters(resolvedAppliedFilters),
        page: 1,
        pageSize,
      });
      if (requestId !== pageLoadIdRef.current) return;
      setMatches(normalizeRecentMatches(loaded.matches, selectedMode));
      setTotalMatches(loaded.total);
      skipNextPageLoadKeyRef.current = pageRequestKey(resolvedAppliedFilters, 1);
      setAppliedFilters(resolvedAppliedFilters);
      setCurrentPage(1);
    } catch (loadError) {
      if (requestId !== pageLoadIdRef.current) return;
      setMatches([]);
      setTotalMatches(0);
      setError(String(loadError));
      setCurrentPage(1);
    } finally {
      searchInFlightRef.current = false;
      if (requestId === pageLoadIdRef.current) {
        setLoadingMatches(false);
      }
    }
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

      const requestId = pageLoadIdRef.current + 1;
      pageLoadIdRef.current = requestId;
      setLoadingMatches(true);
      setError("");
      try {
        const loaded = await loadRawMatchesByMode(appliedFilters.selectedMode, {
          filters: buildSupabaseFilters(appliedFilters),
          page: currentPage,
          pageSize,
        });
        if (requestId !== pageLoadIdRef.current) return;
        setMatches(normalizeRecentMatches(loaded.matches, appliedFilters.selectedMode));
        setTotalMatches(loaded.total);
      } catch (loadError) {
        if (requestId !== pageLoadIdRef.current) return;
        setMatches([]);
        setTotalMatches(0);
        setError(String(loadError));
      } finally {
        if (requestId === pageLoadIdRef.current) {
          setLoadingMatches(false);
        }
      }
    };

    loadPage();
  }, [currentPage, pageSize, appliedFilters, buildSupabaseFilters, pageRequestKey]);

  const paginatedMatches = filteredMatches;
  const setSourceFilter = (source: keyof SourceFilters, checked: boolean): void => {
    setSourceFilters((current) => ({ ...current, [source]: checked }));
  };

  return (
    <div className="rankingsPage">
      <Seo
        title="Recent Atomic Chess Matches"
        description="Filter recent atomic chess matches by player, rating, source, date, time control, and match length across blitz, bullet, and hyperbullet."
        path="/recent"
      />
      <div className="panel rankingsPanel recentMatchesPanel">
        <h1>Recent Matches</h1>
        <p>Newest atomic matches in a card view across blitz, bullet, and hyperbullet.</p>
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

            <DualRangeSlider
              id="recent-length-min"
              label={`Match length range: ${matchLengthMin} - ${
                matchLengthMax >= appliedMatchBounds.max
                  ? `${appliedMatchBounds.max}+`
                  : matchLengthMax
              }`}
              min={appliedMatchBounds.min}
              max={appliedMatchBounds.max}
              lowerValue={matchLengthMin}
              upperValue={matchLengthMax}
              onLowerChange={setMatchLengthMin}
              onUpperChange={setMatchLengthMax}
            />
          </div>

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
        </form>

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta">
          <span>Showing recent matches</span>
          <span>
            {filteredMatches.length === 0
              ? "0 shown"
              : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredMatches.length)} shown`}
            · {filteredMatches.length} filtered / {matches.length} total
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
