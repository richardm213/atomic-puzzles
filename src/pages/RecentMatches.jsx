import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  defaultMatchLengthMax,
  defaultMatchLengthMin,
  defaultRatingMax,
  defaultRatingMin,
  matchLengthBoundsByMode,
  modeOptions,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
} from "../constants/matches";
import { formatLocalDateTime, formatScore, formatSignedDecimal } from "../utils/formatters";
import {
  findRatingDataForPlayer,
  normalizedGamesFromMatch,
  normalizedPlayersFromMatch,
  normalizedRatingsFromMatch,
  winnerToFullWord,
} from "../utils/matchTransforms";
import { loadRawMatchesByMode } from "../lib/rankingsData";

const recentModeOptions = modeOptions;
const ratingFilterTypeOptions = ["both", "average"];
const pageSizeOptions = [25, 50, 100, 200];
const defaultPageSize = 50;

const parseDateInputBoundary = (value, boundary) => {
  if (!value) {
    return boundary === "end" ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return boundary === "end" ? Number.MAX_SAFE_INTEGER : Number.MIN_SAFE_INTEGER;
  }
  if (boundary === "end") {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed.getTime();
};


const normalizeRecentMatches = (matches, mode) =>
  (Array.isArray(matches) ? matches : [])
    .map((match) => {
      const rawPlayers = normalizedPlayersFromMatch(match);
      const players =
        rawPlayers.length > 0
          ? rawPlayers.slice(0, 2).map((player) => String(player || "Unknown"))
          : ["Unknown", "Unknown"];
      const [playerA, playerB] = players.length >= 2 ? players : [players[0], "Unknown"];
      const playerALower = playerA.toLowerCase();
      const games = normalizedGamesFromMatch(match, players);
      let scoreA = 0;
      let scoreB = 0;
      let playerAWins = 0;
      let playerBWins = 0;
      let draws = 0;

      const mappedGames = games.map((game, index) => {
        const white = String(game?.white || "").toLowerCase();
        const black = String(game?.black || "").toLowerCase();
        const winner = winnerToFullWord(game?.winner);
        let resultLabel = "draw";

        if (winner === "white") {
          if (white === playerALower) {
            scoreA += 1;
            playerAWins += 1;
            resultLabel = playerA;
          } else {
            scoreB += 1;
            playerBWins += 1;
            resultLabel = playerB;
          }
        } else if (winner === "black") {
          if (black === playerALower) {
            scoreA += 1;
            playerAWins += 1;
            resultLabel = playerA;
          } else {
            scoreB += 1;
            playerBWins += 1;
            resultLabel = playerB;
          }
        } else {
          scoreA += 0.5;
          scoreB += 0.5;
          draws += 1;
        }

        return {
          id: String(game?.id || "—"),
          resultLabel,
          scoreAAfter: scoreA,
          scoreBAfter: scoreB,
          index,
        };
      });

      const ratings = normalizedRatingsFromMatch(match, players);
      const playerARatingData = findRatingDataForPlayer(ratings, playerA);
      const playerBRatingData = findRatingDataForPlayer(ratings, playerB);
      const playerABeforeRating = Number(playerARatingData?.before_rating);
      const playerAAfterRating = Number(playerARatingData?.after_rating);
      const playerABeforeRd = Number(playerARatingData?.before_rd);
      const playerAAfterRd = Number(playerARatingData?.after_rd);
      const playerBBeforeRating = Number(playerBRatingData?.before_rating);
      const playerBAfterRating = Number(playerBRatingData?.after_rating);
      const playerBBeforeRd = Number(playerBRatingData?.before_rd);
      const playerBAfterRd = Number(playerBRatingData?.after_rd);

      const playerARating = playerAAfterRating;
      const playerBRating = playerBAfterRating;
      const avgRating =
        Number.isFinite(playerARating) && Number.isFinite(playerBRating)
          ? (playerARating + playerBRating) / 2
          : null;

      const firstGame = games[0];
      const sourceValue = [
        firstGame?.source,
        firstGame?.match_source,
        firstGame?.queue,
        match?.source,
        match?.match_source,
        match?.queue,
      ].find((value) => value !== undefined && value !== null && String(value).trim().length > 0);

      return {
        startTs: Number(match?.start_ts ?? match?.s),
        timeControl: String(match?.time_control ?? match?.t ?? "—"),
        mode,
        playerA,
        playerB,
        scoreA,
        scoreB,
        playerAWins,
        playerBWins,
        draws,
        playerARating: Number.isFinite(playerARating) ? playerARating : null,
        playerBRating: Number.isFinite(playerBRating) ? playerBRating : null,
        playerABeforeRating: Number.isFinite(playerABeforeRating) ? playerABeforeRating : null,
        playerAAfterRating: Number.isFinite(playerAAfterRating) ? playerAAfterRating : null,
        playerABeforeRd: Number.isFinite(playerABeforeRd) ? playerABeforeRd : null,
        playerAAfterRd: Number.isFinite(playerAAfterRd) ? playerAAfterRd : null,
        playerBBeforeRating: Number.isFinite(playerBBeforeRating) ? playerBBeforeRating : null,
        playerBAfterRating: Number.isFinite(playerBAfterRating) ? playerBAfterRating : null,
        playerBBeforeRd: Number.isFinite(playerBBeforeRd) ? playerBBeforeRd : null,
        playerBAfterRd: Number.isFinite(playerBAfterRd) ? playerBAfterRd : null,
        avgRating,
        gameCount: games.length,
        firstGameId: String(games[0]?.id || "—"),
        games: mappedGames,
        sourceValue:
          sourceValue === undefined ||
          sourceValue === null ||
          String(sourceValue).trim().length === 0
            ? "—"
            : String(sourceValue),
      };
    })
    .filter((match) => Number.isFinite(match.startTs))
    .sort((a, b) => b.startTs - a.startTs);

export const RecentMatchesPage = () => {
  const [selectedMode, setSelectedMode] = useState("blitz");
  const [matches, setMatches] = useState([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [error, setError] = useState("");
  const [expandedMatchKeys, setExpandedMatchKeys] = useState([]);
  const [ratingFilterType, setRatingFilterType] = useState("both");
  const [ratingMin, setRatingMin] = useState(defaultRatingMin);
  const [ratingMax, setRatingMax] = useState(defaultRatingMax);
  const [player1Filter, setPlayer1Filter] = useState("");
  const [player2Filter, setPlayer2Filter] = useState("");
  const [sourceFilters, setSourceFilters] = useState({
    arena: true,
    friend: true,
    lobby: true,
  });
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [loadingMatches, setLoadingMatches] = useState(false);
  const initialMatchBounds = matchLengthBoundsByMode.blitz;
  const [matchLengthMin, setMatchLengthMin] = useState(
    Math.max(defaultMatchLengthMin, initialMatchBounds.min),
  );
  const [matchLengthMax, setMatchLengthMax] = useState(
    Math.min(defaultMatchLengthMax, initialMatchBounds.max),
  );
  const modeBounds = matchLengthBoundsByMode[selectedMode] ?? matchLengthBoundsByMode.blitz;
  const appliedMatchBounds = modeBounds;
  const [appliedFilters, setAppliedFilters] = useState({
    selectedMode: "blitz",
    ratingFilterType: "both",
    ratingMin: defaultRatingMin,
    ratingMax: defaultRatingMax,
    player1Filter: "",
    player2Filter: "",
    sourceFilters: { arena: true, friend: true, lobby: true },
    startDateFilter: "",
    endDateFilter: "",
    matchLengthMin: Math.max(defaultMatchLengthMin, initialMatchBounds.min),
    matchLengthMax: Math.min(defaultMatchLengthMax, initialMatchBounds.max),
  });

  useEffect(() => {
    setExpandedMatchKeys([]);
  }, [currentPage, appliedFilters]);

  useEffect(() => {
    setMatchLengthMin(Math.max(defaultMatchLengthMin, appliedMatchBounds.min));
    setMatchLengthMax(Math.min(defaultMatchLengthMax, appliedMatchBounds.max));
  }, [selectedMode, appliedMatchBounds.max, appliedMatchBounds.min]);

  const startDateTs = useMemo(
    () => parseDateInputBoundary(appliedFilters.startDateFilter, "start"),
    [appliedFilters.startDateFilter],
  );
  const endDateTs = useMemo(
    () => parseDateInputBoundary(appliedFilters.endDateFilter, "end"),
    [appliedFilters.endDateFilter],
  );

  const filteredMatches = useMemo(
    () =>
      matches.filter((match) => {
        if (startDateTs !== null && match.startTs < startDateTs) return false;
        if (endDateTs !== null && match.startTs > endDateTs) return false;

        if (
          match.gameCount < appliedFilters.matchLengthMin ||
          match.gameCount > appliedFilters.matchLengthMax
        ) {
          return false;
        }

        if (appliedFilters.ratingFilterType === "average") {
          if (Number.isFinite(match.avgRating)) {
            const inAverageRange =
              match.avgRating >= appliedFilters.ratingMin &&
              match.avgRating <= appliedFilters.ratingMax;
            if (!inAverageRange) return false;
          }
        } else if (Number.isFinite(match.playerARating) && Number.isFinite(match.playerBRating)) {
          const bothInRange =
            match.playerARating >= appliedFilters.ratingMin &&
            match.playerARating <= appliedFilters.ratingMax &&
            match.playerBRating >= appliedFilters.ratingMin &&
            match.playerBRating <= appliedFilters.ratingMax;
          if (!bothInRange) return false;
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

        const normalizedSource = String(match.sourceValue || "").toLowerCase();
        const sourceKey = normalizedSource.includes("arena")
          ? "arena"
          : normalizedSource.includes("friend")
            ? "friend"
            : normalizedSource.includes("lobby")
              ? "lobby"
              : "";
        const enabledSources = Object.entries(appliedFilters.sourceFilters)
          .filter(([, enabled]) => Boolean(enabled))
          .map(([key]) => key);
        if (!sourceKey && enabledSources.length === 0) {
          return false;
        }
        if (sourceKey && !appliedFilters.sourceFilters[sourceKey]) {
          return false;
        }

        return true;
      }),
    [
      matches,
      appliedFilters,
      startDateTs,
      endDateTs,
    ],
  );
  const totalPages = Math.max(1, Math.ceil(totalMatches / Math.max(1, pageSize)));

  const handleSearch = async () => {
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
      matchLengthMin,
      matchLengthMax,
    };

    setLoadingMatches(true);
    setError("");
    try {
      const loaded = await loadRawMatchesByMode(selectedMode, {
        filters: {
          username: player1Filter || player2Filter,
          startTs: parseDateInputBoundary(startDateFilter, "start"),
          endTs: parseDateInputBoundary(endDateFilter, "end"),
        },
        page: 1,
        pageSize,
      });
      setMatches(normalizeRecentMatches(loaded.matches, selectedMode));
      setTotalMatches(loaded.total);
      setAppliedFilters(nextAppliedFilters);
      setCurrentPage(1);
    } catch (loadError) {
      setMatches([]);
      setTotalMatches(0);
      setError(String(loadError));
      setCurrentPage(1);
    } finally {
      setLoadingMatches(false);
    }
  };

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  useEffect(() => {
    const loadPage = async () => {
      setLoadingMatches(true);
      setError("");
      try {
        const loaded = await loadRawMatchesByMode(appliedFilters.selectedMode, {
          filters: {
            username: appliedFilters.player1Filter || appliedFilters.player2Filter,
            startTs: parseDateInputBoundary(appliedFilters.startDateFilter, "start"),
            endTs: parseDateInputBoundary(appliedFilters.endDateFilter, "end"),
          },
          page: currentPage,
          pageSize,
        });
        setMatches(normalizeRecentMatches(loaded.matches, appliedFilters.selectedMode));
        setTotalMatches(loaded.total);
      } catch (loadError) {
        setMatches([]);
        setTotalMatches(0);
        setError(String(loadError));
      } finally {
        setLoadingMatches(false);
      }
    };

    loadPage();
  }, [currentPage, pageSize, appliedFilters]);

  const paginatedMatches = filteredMatches;

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel recentMatchesPanel">
        <h1>Recent Matches</h1>
        <p>Newest atomic matches in a card view.</p>
        <div className="controls rankingsControls profileControls">
          <label htmlFor="recent-mode-select">
            Mode
            <select
              id="recent-mode-select"
              value={selectedMode}
              onChange={(event) => setSelectedMode(event.target.value)}
            >
              {recentModeOptions.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="recent-rating-filter-type">
            Rating filter type
            <select
              id="recent-rating-filter-type"
              value={ratingFilterType}
              onChange={(event) => setRatingFilterType(event.target.value)}
            >
              {ratingFilterTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "both" ? "Both players in range" : "Average rating in range"}
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
          <button className="analyzeButton" type="button" onClick={handleSearch} disabled={loadingMatches}>
            {loadingMatches ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="controls profileControls">
          <label htmlFor="recent-start-date-filter">
            From
            <input
              id="recent-start-date-filter"
              type="date"
              value={startDateFilter}
              onChange={(event) => setStartDateFilter(event.target.value)}
            />
          </label>
          <label htmlFor="recent-end-date-filter">
            To
            <input
              id="recent-end-date-filter"
              type="date"
              value={endDateFilter}
              min={startDateFilter || undefined}
              onChange={(event) => setEndDateFilter(event.target.value)}
            />
          </label>
        </div>

        <div className="opponentRatingFilter">
          <span className="statusLabel">Source filter</span>
          <div className="sourceFilterChecks">
            {["arena", "friend", "lobby"].map((source) => (
              <label key={source} className="sourceFilterCheck">
                <input
                  type="checkbox"
                  checked={sourceFilters[source]}
                  onChange={(event) =>
                    setSourceFilters((current) => ({ ...current, [source]: event.target.checked }))
                  }
                />
                <span>{source}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="opponentRatingFilter">
          <label htmlFor="recent-rating-min">
            {`${ratingFilterType === "both" ? "Both-player rating range" : "Average rating range"}: ${ratingMin} - ${ratingMax}`}
          </label>
          <div className="dualRangeSlider">
            <div className="dualRangeTrack" />
            <div
              className="dualRangeSelected"
              style={{
                left: `${((ratingMin - opponentRatingSliderMin) / (opponentRatingSliderMax - opponentRatingSliderMin)) * 100}%`,
                right: `${100 - ((ratingMax - opponentRatingSliderMin) / (opponentRatingSliderMax - opponentRatingSliderMin)) * 100}%`,
              }}
            />
            <input
              id="recent-rating-min"
              className="dualRangeInput"
              type="range"
              min={opponentRatingSliderMin}
              max={opponentRatingSliderMax}
              step={10}
              value={ratingMin}
              onChange={(event) => {
                const nextMin = Number(event.target.value);
                setRatingMin(Math.min(nextMin, ratingMax));
              }}
            />
            <input
              className="dualRangeInput"
              type="range"
              min={opponentRatingSliderMin}
              max={opponentRatingSliderMax}
              step={10}
              value={ratingMax}
              onChange={(event) => {
                const nextMax = Number(event.target.value);
                setRatingMax(Math.max(nextMax, ratingMin));
              }}
            />
          </div>
        </div>

        <div className="opponentRatingFilter">
          <label htmlFor="recent-length-min">
            Match length range: {matchLengthMin} - {matchLengthMax}
          </label>
          <div className="dualRangeSlider">
            <div className="dualRangeTrack" />
            <div
              className="dualRangeSelected"
              style={{
                left: `${((matchLengthMin - appliedMatchBounds.min) / (appliedMatchBounds.max - appliedMatchBounds.min)) * 100}%`,
                right: `${100 - ((matchLengthMax - appliedMatchBounds.min) / (appliedMatchBounds.max - appliedMatchBounds.min)) * 100}%`,
              }}
            />
            <input
              id="recent-length-min"
              className="dualRangeInput"
              type="range"
              min={appliedMatchBounds.min}
              max={appliedMatchBounds.max}
              step={1}
              value={matchLengthMin}
              onChange={(event) => {
                const nextMin = Number(event.target.value);
                setMatchLengthMin(Math.min(nextMin, matchLengthMax));
              }}
            />
            <input
              className="dualRangeInput"
              type="range"
              min={appliedMatchBounds.min}
              max={appliedMatchBounds.max}
              step={1}
              value={matchLengthMax}
              onChange={(event) => {
                const nextMax = Number(event.target.value);
                setMatchLengthMax(Math.max(nextMax, matchLengthMin));
              }}
            />
          </div>
        </div>

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
              <article
                key={matchKey}
                className={`matchCard${isExpanded ? " expanded" : ""}`}
                onClick={() =>
                  setExpandedMatchKeys((current) =>
                    current.includes(matchKey)
                      ? current.filter((key) => key !== matchKey)
                      : [...current, matchKey],
                  )
                }
              >
                <div className="matchCardHeader">
                  <div className="matchCardPlayers">
                    <Link
                      className="rankingLink"
                      to="/@/$username"
                      params={{ username: match.playerA }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {match.playerA}
                    </Link>
                    <span>vs</span>
                    <Link
                      className="rankingLink"
                      to="/@/$username"
                      params={{ username: match.playerB }}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {match.playerB}
                    </Link>
                  </div>
                  <div className="scoreCell">
                    <span>{formatScore(match.scoreA)}</span>
                    <span className="scoreDash"> - </span>
                    <span>{formatScore(match.scoreB)}</span>
                  </div>
                </div>
                <div className="matchCardMeta">
                  <span>
                    {match.firstGameId === "—" ? (
                      formatLocalDateTime(match.startTs)
                    ) : (
                      <a
                        className="rankingLink"
                        href={`https://lichess.org/${encodeURIComponent(match.firstGameId)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {formatLocalDateTime(match.startTs)}
                      </a>
                    )}
                  </span>
                  <span>TC {match.timeControl}</span>
                  <span>Source: {match.sourceValue}</span>
                </div>
                {isExpanded ? (
                  <div className="matchCardDetails">
                    <div className="matchCardPlayerStats">
                      <div>
                        <strong>{match.playerA}</strong>
                        <span>
                          {`Rating ${Number.isFinite(match.playerABeforeRating) ? match.playerABeforeRating.toFixed(1) : "—"} (${
                            Number.isFinite(match.playerAAfterRating) &&
                            Number.isFinite(match.playerABeforeRating)
                              ? formatSignedDecimal(match.playerAAfterRating - match.playerABeforeRating)
                              : "—"
                          })`}
                        </span>
                        <span>
                          {`RD ${Number.isFinite(match.playerABeforeRd) ? match.playerABeforeRd.toFixed(1) : "—"} (${
                            Number.isFinite(match.playerAAfterRd) &&
                            Number.isFinite(match.playerABeforeRd)
                              ? formatSignedDecimal(match.playerAAfterRd - match.playerABeforeRd)
                              : "—"
                          })`}
                        </span>
                      </div>
                      <div>
                        <strong>{match.playerB}</strong>
                        <span>
                          {`Rating ${Number.isFinite(match.playerBBeforeRating) ? match.playerBBeforeRating.toFixed(1) : "—"} (${
                            Number.isFinite(match.playerBAfterRating) &&
                            Number.isFinite(match.playerBBeforeRating)
                              ? formatSignedDecimal(match.playerBAfterRating - match.playerBBeforeRating)
                              : "—"
                          })`}
                        </span>
                        <span>
                          {`RD ${Number.isFinite(match.playerBBeforeRd) ? match.playerBBeforeRd.toFixed(1) : "—"} (${
                            Number.isFinite(match.playerBAfterRd) &&
                            Number.isFinite(match.playerBBeforeRd)
                              ? formatSignedDecimal(match.playerBAfterRd - match.playerBBeforeRd)
                              : "—"
                          })`}
                        </span>
                      </div>
                    </div>
                    <div className="matchGamesHeader">
                      <strong>Game</strong>
                      <strong>Result</strong>
                      <strong>ID</strong>
                    </div>
                    <ul className="matchGamesList">
                      {match.games.map((game) => (
                        <li key={`${matchKey}-${game.id}-${game.index}`} className="matchGameRow">
                          <span>Game {game.index + 1}</span>
                          <span>{game.resultLabel}</span>
                          <span>
                            {game.id === "—" ? (
                              "—"
                            ) : (
                              <a
                                className="rankingLink"
                                href={`https://lichess.org/${encodeURIComponent(game.id)}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {game.id}
                              </a>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })}
          {filteredMatches.length === 0 ? (
            <div className="emptyRankings">No matches found with current filters.</div>
          ) : null}
        </div>
        {filteredMatches.length > 0 ? (
          <div className="paginationRow">
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage <= 1}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage >= totalPages}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
