import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import "./PlayerProfile.css";
import {
  defaultRatingMax,
  defaultRatingMin,
  matchLengthBoundsByMode,
  modeOptions,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
} from "../../constants/matches";
import { useAliasesLookup } from "../../hooks/useAliasesLookup";
import { toBoundedLengthRange, useMatchLengthRange } from "../../hooks/useMatchLengthRange";
import {
  useAliasesForUser,
  useBestWins,
  useExpandedMatchKeys,
  useFilteredMatches,
  useMonthRankHighlights,
  useMonthRanks,
  useProfileMetricCards,
  useRatingDisplayByMode,
  useRatingsSnapshotByMode,
  useTimeControlOptions,
} from "../../hooks/usePlayerProfileData";
import {
  formatLocalDateTime,
  formatOpponentWithRating,
  formatScore,
  formatSignedDecimal,
} from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";
import { loadRawMatchesByMode, normalizeMatches } from "../../lib/matchData";
import { DualRangeSlider } from "../../components/DualRangeSlider/DualRangeSlider";
import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { ProfileMetricCard } from "../../components/ProfileMetricCard/ProfileMetricCard";

const countOptions = [5, 10, 20];

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

  return queryFilters;
};

export const PlayerProfilePage = ({ username }) => {
  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);
  const [selectedMode, setSelectedMode] = useState("blitz");
  const [matchesByMode, setMatchesByMode] = useState({
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
  const defaultLengthRange = useMemo(() => toBoundedLengthRange("blitz"), []);
  const { matchLengthMin, setMatchLengthMin, matchLengthMax, setMatchLengthMax } =
    useMatchLengthRange(selectedMode);
  const [opponentRatingMin, setOpponentRatingMin] = useState(defaultRatingMin);
  const [opponentRatingMax, setOpponentRatingMax] = useState(defaultRatingMax);
  const [timeControlInitialFilter, setTimeControlInitialFilter] = useState("all");
  const [timeControlIncrementFilter, setTimeControlIncrementFilter] = useState("all");
  const [loadingMatches, setLoadingMatches] = useState(false);
  const matchRequestIdRef = useRef(0);
  const searchSubmitInFlightRef = useRef(false);
  const aliasesLookup = useAliasesLookup();
  const ratingsSnapshotByMode = useRatingsSnapshotByMode(normalizedUsername);
  const monthRanks = useMonthRanks(normalizedUsername);
  const [bestMonthRankCount, setBestMonthRankCount] = useState(5);
  const [recentMonthRankCount, setRecentMonthRankCount] = useState(5);
  const [bestWinCount, setBestWinCount] = useState(5);
  const [appliedFilters, setAppliedFilters] = useState({
    matchLengthMin: defaultLengthRange.min,
    matchLengthMax: defaultLengthRange.max,
    opponentRatingMin: defaultRatingMin,
    opponentRatingMax: defaultRatingMax,
    timeControlInitialFilter: "all",
    timeControlIncrementFilter: "all",
  });
  const matchLengthBounds = matchLengthBoundsByMode[selectedMode] ?? matchLengthBoundsByMode.blitz;

  const runMatchSearch = async (mode, nextAppliedFilters, nextPage = 1) => {
    const requestId = matchRequestIdRef.current + 1;
    matchRequestIdRef.current = requestId;
    setLoadingMatches(true);
    setError("");
    try {
      const loaded = await loadRawMatchesByMode(mode, {
        filters: buildMatchFilters(normalizedUsername, nextAppliedFilters),
        page: nextPage,
        pageSize,
      });
      if (requestId !== matchRequestIdRef.current) return;
      setMatchesByMode((current) => ({
        ...current,
        [mode]: normalizeMatches(loaded.matches, normalizedUsername),
      }));
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
      timeControlInitialFilter: "all",
      timeControlIncrementFilter: "all",
    };
    runMatchSearch("blitz", defaultFilters, 1);
  }, [normalizedUsername]);

  const matches = matchesByMode[selectedMode] ?? [];

  useEffect(() => {
    setTimeControlInitialFilter("all");
    setTimeControlIncrementFilter("all");
  }, [selectedMode]);

  const { initialOptions, incrementOptions } = useTimeControlOptions(matches);
  const filteredMatches = useFilteredMatches(matches, appliedFilters, selectedMode);

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

  useEffect(() => {
    if (currentPage !== page) {
      setPage(currentPage);
      return;
    }
    if (appliedFilters && totalPages > 0) {
      runMatchSearch(selectedMode, appliedFilters, currentPage);
    }
  }, [currentPage, pageSize, selectedMode]);

  const { expandedMatchKeys, toggleExpandedMatchKey } = useExpandedMatchKeys(
    currentPage,
    selectedMode,
    appliedFilters,
    normalizedUsername,
  );

  const ratingDisplayByMode = useRatingDisplayByMode(ratingsSnapshotByMode, normalizedUsername);
  const blitzDisplaySummary = ratingDisplayByMode.blitz;
  const bulletDisplaySummary = ratingDisplayByMode.bullet;
  const bestWins = useBestWins(filteredMatches, normalizedUsername, bestWinCount);
  const { bestMonthRanks, recentMonthRanks } = useMonthRankHighlights(
    monthRanks,
    bestMonthRankCount,
    recentMonthRankCount,
  );
  const aliasesForUser = useAliasesForUser(aliasesLookup, normalizedUsername);
  const profileMetricCards = useProfileMetricCards(blitzDisplaySummary, bulletDisplaySummary);

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel">
        <h1>{normalizedUsername}</h1>

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
                  <div key={`alias-${alias}`}>{alias}</div>
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
          className="controls rankingsControls profileControls"
          onSubmit={(event) => {
            event.preventDefault();
            handleSearchClick();
          }}
        >
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
          <label htmlFor="profile-time-initial-select">
            Initial (sec)
            <select
              id="profile-time-initial-select"
              value={timeControlInitialFilter}
              onChange={(event) => setTimeControlInitialFilter(event.target.value)}
            >
              <option value="all">All</option>
              {initialOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="profile-time-increment-select">
            Increment (sec)
            <select
              id="profile-time-increment-select"
              value={timeControlIncrementFilter}
              onChange={(event) => setTimeControlIncrementFilter(event.target.value)}
            >
              <option value="all">All</option>
              {incrementOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            className="analyzeButton"
            type="submit"
            disabled={loadingMatches}
          >
            {loadingMatches ? "Searching..." : "Search"}
          </button>
        </form>

        <DualRangeSlider
          id="match-length-min"
          label={`Match length range: ${matchLengthMin} - ${
            matchLengthMax >= matchLengthBounds.max ? `${matchLengthBounds.max}+` : matchLengthMax
          }`}
          min={matchLengthBounds.min}
          max={matchLengthBounds.max}
          lowerValue={matchLengthMin}
          upperValue={matchLengthMax}
          onLowerChange={setMatchLengthMin}
          onUpperChange={setMatchLengthMax}
        />

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

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta">
          <span>Match History ({selectedMode})</span>
          <span>
            {filteredMatches.length} filtered / {matches.length} total
          </span>
        </div>

        <div className="rankingsTableWrap">
          <table className="rankingsTable">
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
                      onClick={() => toggleExpandedMatchKey(matchKey)}
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
                      <td>{match.timeControl}</td>
                      <td className="scoreCell">
                        <span>{formatScore(match.playerScore)}</span>
                        <span className="scoreDash"> - </span>
                        <span>{formatScore(match.opponentScore)}</span>
                      </td>
                      <td>{`${match.afterRating}(${formatSignedDecimal(match.ratingChange)})`}</td>
                      <td>{`${match.afterRd}(${formatSignedDecimal(match.rdChange)})`}</td>
                    </tr>
                    {isExpanded ? (
                      <tr className="matchDetailsRow">
                        <td colSpan={6}>
                          <div className="matchDetailsInner">
                            <strong>Games</strong>
                            <ul>
                              {match.games.map((game, index) => (
                                <li key={`${matchKey}-${game.id}-${index}`}>
                                  {`Game ${index + 1}: winner ${game.winner}, score ${formatScore(
                                    game.playerScoreAfter,
                                  )} - ${formatScore(game.opponentScoreAfter)}`}
                                  <span> • </span>
                                  <LichessGameLink gameId={game.id}>{game.id}</LichessGameLink>
                                </li>
                              ))}
                            </ul>
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
