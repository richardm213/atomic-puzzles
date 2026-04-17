import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import "./PlayerProfile.css";
import {
  defaultRatingMax,
  defaultRatingMin,
  defaultSourceFilters,
  matchLengthBoundsByMode,
  modeOptions,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
} from "../../constants/matches";
import { loadAliasesLookup } from "../../lib/aliasesLookup";
import { resolveUsernameInput } from "../../lib/searchUsernames";
import { toBoundedLengthRange, useMatchLengthRange } from "../../hooks/useMatchLengthRange";
import {
  filterMatches,
  getAliasesForUser,
  getBestWins,
  getMonthRankHighlights,
  getProfileMetricCards,
  getRatingDisplayByMode,
  getTimeControlOptions,
  toggleExpandedMatchKey,
  useMonthRanks,
  useRatingsSnapshotByMode,
} from "../../hooks/usePlayerProfileData";
import {
  formatLocalDateTime,
  formatOpponentWithRating,
  formatScore,
  formatSignedDecimal,
} from "../../utils/formatters";
import { scoreToneClass } from "../../utils/matchPresentation";
import { normalizeUsername } from "../../utils/playerNames";
import { isToggleActionKey } from "../../utils/toggleActionKey";
import { parseDateInputBoundary } from "../../utils/matchFilters";
import { loadRawMatchesByMode, normalizeMatches } from "../../lib/matchData";
import { DualRangeSlider } from "../../components/DualRangeSlider/DualRangeSlider";
import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { ProfileMetricCard } from "../../components/ProfileMetricCard/ProfileMetricCard";
import { SourceFilterChecks } from "../../components/SourceFilterChecks/SourceFilterChecks";
import { TimeControlFields } from "../../components/TimeControlFields/TimeControlFields";

const countOptions = [5, 10, 20];

const lichessProfileUrl = (username) =>
  `https://lichess.org/@/${encodeURIComponent(String(username || "").trim())}`;

const LichessProfileIcon = () => (
  <svg viewBox="0 0 50 50" aria-hidden="true" focusable="false">
    <path
      d="M38.956.5c-3.53.418-6.452.902-9.286 2.984C5.534 1.786-.692 18.533.68 29.364 3.493 50.214 31.918 55.785 41.329 41.7c-7.444 7.696-19.276 8.752-28.323 3.084S-.506 27.392 4.683 17.567C9.873 7.742 18.996 4.535 29.03 6.405c2.43-1.418 5.225-3.22 7.655-3.187l-1.694 4.86 12.752 21.37c-.439 5.654-5.459 6.112-5.459 6.112-.574-1.47-1.634-2.942-4.842-6.036-3.207-3.094-17.465-10.177-15.788-16.207-2.001 6.967 10.311 14.152 14.04 17.663 3.73 3.51 5.426 6.04 5.795 6.756 0 0 9.392-2.504 7.838-8.927L37.4 7.171z"
      fill="currentColor"
    />
  </svg>
);

const buildMatchFilters = (username, filters) => {
  const queryFilters = { username };
  const { timeControlInitialFilter, timeControlIncrementFilter } = filters;
  const timeControl =
    timeControlInitialFilter !== "all" && timeControlIncrementFilter !== "all"
      ? `${timeControlInitialFilter}+${timeControlIncrementFilter}`
      : "";

  if (timeControl) queryFilters.timeControl = timeControl;
  if (
    filters.opponentRatingMin !== defaultRatingMin ||
    filters.opponentRatingMax !== defaultRatingMax
  ) {
    queryFilters.opponentRatingMin = filters.opponentRatingMin;
    queryFilters.opponentRatingMax = filters.opponentRatingMax;
  }
  if (filters.startDateFilter) {
    queryFilters.startTs = parseDateInputBoundary(filters.startDateFilter, "start");
  }
  if (filters.endDateFilter) {
    queryFilters.endTs = parseDateInputBoundary(filters.endDateFilter, "end");
  }

  return queryFilters;
};

export const PlayerProfilePage = ({ username }) => {
  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);
  const [resolvedUsername, setResolvedUsername] = useState(normalizedUsername);
  const [selectedMode, setSelectedMode] = useState("blitz");
  const [aliasesLookup, setAliasesLookup] = useState(() => new Map());
  const [matchesByMode, setMatchesByMode] = useState({
    blitz: [],
    bullet: [],
  });
  const [bestWinMatchesByMode, setBestWinMatchesByMode] = useState({
    blitz: [],
    bullet: [],
  });
  const [totalMatchesByMode, setTotalMatchesByMode] = useState({
    blitz: 0,
    bullet: 0,
  });
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedMatchKeys, setExpandedMatchKeys] = useState([]);
  const defaultLengthRange = toBoundedLengthRange("blitz");
  const { matchLengthMin, setMatchLengthMin, matchLengthMax, setMatchLengthMax } =
    useMatchLengthRange(selectedMode);
  const [opponentRatingMin, setOpponentRatingMin] = useState(defaultRatingMin);
  const [opponentRatingMax, setOpponentRatingMax] = useState(defaultRatingMax);
  const [opponentFilter, setOpponentFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [sourceFilters, setSourceFilters] = useState(defaultSourceFilters);
  const [timeControlInitialFilter, setTimeControlInitialFilter] = useState("all");
  const [timeControlIncrementFilter, setTimeControlIncrementFilter] = useState("all");
  const [loadingMatches, setLoadingMatches] = useState(false);
  const matchRequestIdRef = useRef(0);
  const bestWinRequestKeyByModeRef = useRef({});
  const searchSubmitInFlightRef = useRef(false);
  const canonicalUsername = aliasesLookup.get(resolvedUsername)?.primary ?? resolvedUsername;
  const ratingsSnapshotByMode = useRatingsSnapshotByMode(canonicalUsername);
  const monthRanks = useMonthRanks(canonicalUsername);
  const [bestMonthRankCount, setBestMonthRankCount] = useState(5);
  const [recentMonthRankCount, setRecentMonthRankCount] = useState(5);
  const [bestWinCount, setBestWinCount] = useState(5);
  const [appliedFilters, setAppliedFilters] = useState({
    matchLengthMin: defaultLengthRange.min,
    matchLengthMax: defaultLengthRange.max,
    opponentRatingMin: defaultRatingMin,
    opponentRatingMax: defaultRatingMax,
    opponentFilter: "",
    startDateFilter: "",
    endDateFilter: "",
    sourceFilters: defaultSourceFilters,
    timeControlInitialFilter: "all",
    timeControlIncrementFilter: "all",
  });
  const matchLengthBounds = matchLengthBoundsByMode[selectedMode] ?? matchLengthBoundsByMode.blitz;

  useEffect(() => {
    let isCurrent = true;

    const resolveUsername = async () => {
      try {
        const nextResolvedUsername = await resolveUsernameInput(normalizedUsername);
        if (isCurrent) setResolvedUsername(nextResolvedUsername || normalizedUsername);
      } catch {
        if (isCurrent) setResolvedUsername(normalizedUsername);
      }
    };

    resolveUsername();

    return () => {
      isCurrent = false;
    };
  }, [normalizedUsername]);

  useEffect(() => {
    let isCurrent = true;

    const loadAliases = async () => {
      try {
        const lookup = await loadAliasesLookup();
        if (isCurrent) setAliasesLookup(lookup);
      } catch {
        if (isCurrent) setAliasesLookup(new Map());
      }
    };

    loadAliases();

    return () => {
      isCurrent = false;
    };
  }, []);

  const runMatchSearch = async (mode, nextAppliedFilters, nextPage = 1) => {
    const requestId = matchRequestIdRef.current + 1;
    matchRequestIdRef.current = requestId;
    setLoadingMatches(true);
    setError("");
    try {
      const filters = buildMatchFilters(canonicalUsername, nextAppliedFilters);
      const bestWinRequestKey = JSON.stringify({ mode, username: canonicalUsername, filters });
      const shouldLoadBestWinMatches =
        bestWinRequestKeyByModeRef.current[mode] !== bestWinRequestKey;
      const [loaded, bestWinMatches] = await Promise.all([
        loadRawMatchesByMode(mode, {
          filters,
          page: nextPage,
          pageSize,
        }),
        shouldLoadBestWinMatches ? loadRawMatchesByMode(mode, { filters }) : null,
      ]);
      if (requestId !== matchRequestIdRef.current) return;
      setMatchesByMode((current) => ({
        ...current,
        [mode]: normalizeMatches(loaded.matches, canonicalUsername),
      }));
      if (bestWinMatches) {
        bestWinRequestKeyByModeRef.current[mode] = bestWinRequestKey;
        setBestWinMatchesByMode((current) => ({
          ...current,
          [mode]: normalizeMatches(bestWinMatches, canonicalUsername),
        }));
      }
      setTotalMatchesByMode((current) => ({
        ...current,
        [mode]: loaded.total,
      }));
      setAppliedFilters(nextAppliedFilters);
      setPage(nextPage);
    } catch (loadError) {
      if (requestId !== matchRequestIdRef.current) return;
      setMatchesByMode((current) => ({
        ...current,
        [mode]: [],
      }));
      setBestWinMatchesByMode((current) => ({
        ...current,
        [mode]: [],
      }));
      setTotalMatchesByMode((current) => ({
        ...current,
        [mode]: 0,
      }));
      setError(String(loadError));
    } finally {
      if (requestId === matchRequestIdRef.current) {
        setLoadingMatches(false);
      }
    }
  };

  useEffect(() => {
    const defaultFilters = {
      matchLengthMin: defaultLengthRange.min,
      matchLengthMax: defaultLengthRange.max,
      opponentRatingMin: defaultRatingMin,
      opponentRatingMax: defaultRatingMax,
      opponentFilter: "",
      startDateFilter: "",
      endDateFilter: "",
      sourceFilters: defaultSourceFilters,
      timeControlInitialFilter: "all",
      timeControlIncrementFilter: "all",
    };
    runMatchSearch("blitz", defaultFilters, 1);
  }, [canonicalUsername]);

  useEffect(() => {
    setExpandedMatchKeys([]);
  }, [page, selectedMode, appliedFilters, canonicalUsername]);

  const matches = matchesByMode[selectedMode] ?? [];
  const bestWinMatches = bestWinMatchesByMode[selectedMode] ?? [];

  useEffect(() => {
    setTimeControlInitialFilter("all");
    setTimeControlIncrementFilter("all");
  }, [selectedMode]);

  const { initialOptions, incrementOptions } = useMemo(
    () => getTimeControlOptions(matches),
    [matches],
  );
  const filteredMatches = useMemo(
    () => filterMatches(matches, appliedFilters, selectedMode),
    [matches, appliedFilters, selectedMode],
  );
  const filteredBestWinMatches = useMemo(
    () => filterMatches(bestWinMatches, appliedFilters, selectedMode),
    [bestWinMatches, appliedFilters, selectedMode],
  );

  const handleSearchClick = async () => {
    if (searchSubmitInFlightRef.current || loadingMatches) return;

    searchSubmitInFlightRef.current = true;
    try {
      await runMatchSearch(
        selectedMode,
        {
          matchLengthMin,
          matchLengthMax,
          opponentRatingMin,
          opponentRatingMax,
          opponentFilter,
          startDateFilter,
          endDateFilter,
          sourceFilters: { ...sourceFilters },
          timeControlInitialFilter,
          timeControlIncrementFilter,
        },
        1,
      );
    } finally {
      searchSubmitInFlightRef.current = false;
    }
  };

  const totalPages = Math.max(
    1,
    Math.ceil((totalMatchesByMode[selectedMode] ?? 0) / Math.max(1, pageSize)),
  );
  const currentPage = Math.min(page, totalPages);
  const setSourceFilter = (source, checked) => {
    setSourceFilters((current) => ({ ...current, [source]: checked }));
  };

  useEffect(() => {
    if (currentPage !== page) {
      setPage(currentPage);
      return;
    }
    if (appliedFilters && totalPages > 0) {
      runMatchSearch(selectedMode, appliedFilters, currentPage);
    }
  }, [currentPage, pageSize, selectedMode]);

  const ratingDisplayByMode = useMemo(
    () => getRatingDisplayByMode(ratingsSnapshotByMode, canonicalUsername),
    [ratingsSnapshotByMode, canonicalUsername],
  );
  const blitzDisplaySummary = ratingDisplayByMode.blitz;
  const bulletDisplaySummary = ratingDisplayByMode.bullet;
  const bestWins = useMemo(
    () => getBestWins(filteredBestWinMatches, canonicalUsername, bestWinCount),
    [filteredBestWinMatches, canonicalUsername, bestWinCount],
  );
  const { bestMonthRanks, recentMonthRanks } = useMemo(
    () => getMonthRankHighlights(monthRanks, bestMonthRankCount, recentMonthRankCount),
    [monthRanks, bestMonthRankCount, recentMonthRankCount],
  );
  const aliasesForUser = useMemo(
    () => getAliasesForUser(aliasesLookup, canonicalUsername),
    [aliasesLookup, canonicalUsername],
  );
  const profileMetricCards = useMemo(
    () => getProfileMetricCards(blitzDisplaySummary, bulletDisplaySummary),
    [blitzDisplaySummary, bulletDisplaySummary],
  );

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel playerProfilePanel">
        <h1>{canonicalUsername}</h1>

        <div className="profileTopBar">
          {profileMetricCards.map((card) => (
            <ProfileMetricCard key={card.key} label={card.label} value={card.value} />
          ))}
        </div>

        <div className="profileHighlights profileHighlightsTopRow">
          <div className="profileBestWins">
            <div className="profileBestMonthRanksHeader">
              <h2>Best Wins</h2>
              <label htmlFor="profile-best-win-count-select">
                Show
                <select
                  id="profile-best-win-count-select"
                  value={bestWinCount}
                  onChange={(event) => setBestWinCount(Number(event.target.value))}
                >
                  {countOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {bestWins.length === 0 ? (
              <div className="emptyRankings">No wins available in {selectedMode}.</div>
            ) : (
              <ol>
                {bestWins.map((match) => (
                  <li key={`best-${match.startTs}-${match.firstGameId}`}>
                    <span className="profileBestWinOpponent">
                      <Link
                        className="rankingLink"
                        to="/@/$username"
                        params={{ username: match.opponent }}
                      >
                        {formatOpponentWithRating(match.opponent, match.opponentAfterRating)}
                      </Link>
                    </span>
                    <span className="profileBestWinDate">
                      <LichessGameLink gameId={match.firstGameId}>
                        {formatLocalDateTime(match.startTs)}
                      </LichessGameLink>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="profileAliases">
            <h2>Aliases</h2>
            {aliasesForUser.length === 0 ? (
              <div className="emptyRankings">No aliases listed.</div>
            ) : (
              <div className="profileAliasesList">
                {aliasesForUser.map((alias) => (
                  <div key={`alias-${alias}`} className="profileAliasRow">
                    <span>{alias}</span>
                    <a
                      className="profileAliasLichessLink"
                      href={lichessProfileUrl(alias)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${alias} on Lichess`}
                      title={`Open ${alias} on Lichess`}
                    >
                      <LichessProfileIcon />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="profileHighlights profileHighlightsBottomRow">
          <div className="profileBestMonthRanks">
            <div className="profileBestMonthRanksHeader">
              <h2>Best Ranks</h2>
              <label htmlFor="profile-best-month-rank-count-select">
                Show
                <select
                  id="profile-best-month-rank-count-select"
                  value={bestMonthRankCount}
                  onChange={(event) => setBestMonthRankCount(Number(event.target.value))}
                >
                  {countOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {bestMonthRanks.length === 0 ? (
              <div className="emptyRankings">No monthly ranks available in {selectedMode}.</div>
            ) : (
              <ol>
                {bestMonthRanks.map((monthRank) => (
                  <li key={`best-month-rank-${monthRank.mode}-${monthRank.monthKey}`}>
                    <span className="profileBestMonthRankPrimary">
                      {monthRank.monthLabel} {monthRank.mode} · #{monthRank.rank}
                    </span>
                    <span className="profileBestMonthRankRating">{monthRank.rating}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div className="profileBestMonthRanks">
            <div className="profileBestMonthRanksHeader">
              <h2>Recent Ranks</h2>
              <label htmlFor="profile-recent-month-rank-count-select">
                Show
                <select
                  id="profile-recent-month-rank-count-select"
                  value={recentMonthRankCount}
                  onChange={(event) => setRecentMonthRankCount(Number(event.target.value))}
                >
                  {countOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {recentMonthRanks.length === 0 ? (
              <div className="emptyRankings">No monthly ranks available.</div>
            ) : (
              <ol>
                {recentMonthRanks.map((monthRank) => (
                  <li key={`recent-month-rank-${monthRank.mode}-${monthRank.monthKey}`}>
                    <span className="profileBestMonthRankPrimary">
                      {monthRank.monthLabel} {monthRank.mode} · #{monthRank.rank}
                    </span>
                    <span className="profileBestMonthRankRating">{monthRank.rating}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <form
          className="matchFilterPanel profileMatchFilters"
          onSubmit={(event) => {
            event.preventDefault();
            handleSearchClick();
          }}
        >
          <div className="matchFilterGrid">
            <label htmlFor="profile-mode-select">
              Mode
              <select
                id="profile-mode-select"
                value={selectedMode}
                onChange={(event) => setSelectedMode(event.target.value)}
              >
                {modeOptions.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
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
            <label htmlFor="profile-opponent-filter">
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

            <DualRangeSlider
              id="match-length-min"
              label={`Match length range: ${matchLengthMin} - ${
                matchLengthMax >= matchLengthBounds.max
                  ? `${matchLengthBounds.max}+`
                  : matchLengthMax
              }`}
              min={matchLengthBounds.min}
              max={matchLengthBounds.max}
              lowerValue={matchLengthMin}
              upperValue={matchLengthMax}
              onLowerChange={setMatchLengthMin}
              onUpperChange={setMatchLengthMax}
            />
          </div>

          <SourceFilterChecks values={sourceFilters} onChange={setSourceFilter} />
          <div className="matchFilterActions">
            <button className="analyzeButton matchFilterSearch" type="submit" disabled={loadingMatches}>
              {loadingMatches ? "Searching..." : "Search"}
            </button>
          </div>
        </form>

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta">
          <span>Match History ({selectedMode})</span>
          <span>
            {filteredMatches.length} filtered / {matches.length} total
          </span>
        </div>

        <div className="rankingsTableWrap profileMatchTableWrap">
          <table className="rankingsTable profileMatchTable">
            <thead>
              <tr>
                <th>Date / Time</th>
                <th>Opponent</th>
                <th>TC</th>
                <th>Score</th>
                <th>Rating (Δ)</th>
                <th>RD (Δ)</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatches.map((match) => {
                const matchKey = `${match.startTs}-${match.firstGameId}`;
                const isExpanded = expandedMatchKeys.includes(matchKey);
                return (
                  <Fragment key={matchKey}>
                    <tr
                      className={`expandableMatchRow${isExpanded ? " expanded" : ""}`}
                      onClick={() =>
                        setExpandedMatchKeys((current) => toggleExpandedMatchKey(current, matchKey))
                      }
                      onKeyDown={(event) => {
                        if (!isToggleActionKey(event)) return;
                        event.preventDefault();
                        setExpandedMatchKeys((current) =>
                          toggleExpandedMatchKey(current, matchKey),
                        );
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                    >
                      <td>
                        <LichessGameLink
                          gameId={match.firstGameId}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {formatLocalDateTime(match.startTs)}
                        </LichessGameLink>
                      </td>
                      <td>
                        <Link
                          className="rankingLink"
                          to="/@/$username"
                          params={{ username: match.opponent }}
                          onClick={(event) => event.stopPropagation()}
                        >
                          {formatOpponentWithRating(match.opponent, match.opponentAfterRating)}
                        </Link>
                      </td>
                      <td>
                        <span className="profileTablePill">{match.timeControl}</span>
                      </td>
                      <td className="scoreCell">
                        <span className="profileScoreBox">
                          <span
                            className={`profileScoreValue${scoreToneClass(
                              match.playerScore,
                              match.opponentScore,
                            )}`}
                          >
                            {formatScore(match.playerScore)}
                          </span>
                          <span className="scoreDash">-</span>
                          <span className="profileScoreValue">{formatScore(match.opponentScore)}</span>
                        </span>
                      </td>
                      <td>
                        <span className="profileMetricValue">{match.afterRating}</span>
                        <span className="profileDelta">
                          {formatSignedDecimal(match.ratingChange)}
                        </span>
                      </td>
                      <td>
                        <span className="profileMetricValue">{match.afterRd}</span>
                        <span className="profileDelta">{formatSignedDecimal(match.rdChange)}</span>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="matchDetailsRow">
                        <td colSpan={6}>
                          <div className="matchDetailsInner">
                            <div className="matchCardPlayerStats profileMatchPlayerStats">
                              <div>
                                <strong>{canonicalUsername}</strong>
                                <span>
                                  {`Rating ${match.beforeRating} (${formatSignedDecimal(
                                    match.ratingChange,
                                  )})`}
                                </span>
                                <span>
                                  {`RD ${match.beforeRd} (${formatSignedDecimal(match.rdChange)})`}
                                </span>
                              </div>
                              <div>
                                <strong>{match.opponent}</strong>
                                <span>
                                  {`Rating ${match.opponentBeforeRating} (${formatSignedDecimal(
                                    match.opponentAfterRating - match.opponentBeforeRating,
                                  )})`}
                                </span>
                                <span>
                                  {`RD ${match.opponentBeforeRd} (${formatSignedDecimal(
                                    match.opponentAfterRd - match.opponentBeforeRd,
                                  )})`}
                                </span>
                              </div>
                            </div>
                            <div className="matchGames profileMatchGames">
                              <div className="matchGamesHeader profileMatchGameHeader">
                                <strong>Game</strong>
                                <strong>Result</strong>
                                <strong>Score</strong>
                                <strong>ID</strong>
                              </div>
                              <ul className="matchGamesList profileMatchGamesList">
                                {match.games.map((game, index) => (
                                  <li
                                    key={`${matchKey}-${game.id}-${index}`}
                                    className="matchGameRow profileMatchGame"
                                  >
                                    <span>Game {index + 1}</span>
                                    <span>{game.winner}</span>
                                    <span>{`${formatScore(game.playerScoreAfter)} - ${formatScore(
                                      game.opponentScoreAfter,
                                    )}`}</span>
                                    <span>
                                      <LichessGameLink gameId={game.id}>{game.id}</LichessGameLink>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {filteredMatches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="emptyRankings">
                    No matches found for this player with current filters in {selectedMode}.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <PaginationRow
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          formatLabel={(current, total) => `Page ${current} / ${total}`}
          disabled={loadingMatches}
        />
      </div>
    </div>
  );
};
