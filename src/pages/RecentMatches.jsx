import { useEffect, useMemo, useState } from "react";

const opponentRatingSliderMin = 1500;
const opponentRatingSliderMax = 2500;
const defaultRatingMin = 2000;
const defaultRatingMax = 2500;
const defaultMatchLengthMin = 2;
const defaultMatchLengthMax = 50;
const matchLengthBoundsByMode = {
  blitz: { min: 1, max: 50 },
  bullet: { min: 1, max: 200 },
};
const recentModeOptions = ["blitz", "bullet"];
const ratingFilterTypeOptions = ["both", "average"];
const pageSizeOptions = [25, 50, 100, 200];
const defaultPageSize = 50;

const formatLocalDateTime = (timestamp) => {
  if (!Number.isFinite(timestamp)) return "—";
  const date = new Date(timestamp);
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();
  const month = date.toLocaleString("en-US", { month: "short" }).toLowerCase();
  const day = date.getDate();
  const year = date.getFullYear();
  const time = date
    .toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();

  return includeYear ? `${month} ${day}, ${year} ${time}` : `${month} ${day} ${time}`;
};

const formatScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0.0";
  return numeric.toFixed(1);
};

const formatSigned = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  if (numeric > 0) return `+${numeric.toFixed(1)}`;
  return numeric.toFixed(1);
};

const parseDateInputBoundary = (value, boundary) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (boundary === "end") {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed.getTime();
};

const loadRawRecentMatchesByMode = async (mode) => {
  const response = await fetch(`/private/${mode}_matches.json`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Could not load /private/${mode}_matches.json (HTTP ${response.status})`);
  }
  const loaded = await response.json();
  return Array.isArray(loaded) ? loaded : [];
};

const findRatingDataForPlayer = (ratings, playerName) => {
  if (!ratings || typeof ratings !== "object") return null;
  if (ratings[playerName]) return ratings[playerName];

  const playerLower = String(playerName).toLowerCase();
  const matchKey = Object.keys(ratings).find((key) => String(key).toLowerCase() === playerLower);
  if (!matchKey) return null;
  return ratings[matchKey];
};

const normalizeRecentMatches = (matches, mode) =>
  (Array.isArray(matches) ? matches : [])
    .map((match) => {
      const players = Array.isArray(match?.players)
        ? match.players.slice(0, 2).map((player) => String(player || "Unknown"))
        : ["Unknown", "Unknown"];
      const [playerA, playerB] = players.length >= 2 ? players : [players[0], "Unknown"];
      const playerALower = playerA.toLowerCase();
      const games = Array.isArray(match?.games) ? match.games : [];
      let scoreA = 0;
      let scoreB = 0;
      let playerAWins = 0;
      let playerBWins = 0;
      let draws = 0;

      const mappedGames = games.map((game, index) => {
        const white = String(game?.white || "").toLowerCase();
        const black = String(game?.black || "").toLowerCase();
        const winner = game?.winner;
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

      const ratings = match?.ratings;
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
        startTs: Number(match?.start_ts),
        timeControl: String(match?.time_control || "—"),
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
  const initialMatchBounds = matchLengthBoundsByMode.blitz;
  const [matchLengthMin, setMatchLengthMin] = useState(
    Math.max(defaultMatchLengthMin, initialMatchBounds.min),
  );
  const [matchLengthMax, setMatchLengthMax] = useState(
    Math.min(defaultMatchLengthMax, initialMatchBounds.max),
  );
  const modeBounds = matchLengthBoundsByMode[selectedMode] ?? matchLengthBoundsByMode.blitz;
  const appliedMatchBounds = modeBounds;

  useEffect(() => {
    const loadMatches = async () => {
      setError("");
      try {
        const loaded = await loadRawRecentMatchesByMode(selectedMode);
        const normalized = normalizeRecentMatches(loaded, selectedMode);
        setMatches(normalized);
        setCurrentPage(1);
      } catch (loadError) {
        setMatches([]);
        setCurrentPage(1);
        setError(String(loadError));
      }
    };

    loadMatches();
  }, [selectedMode]);

  useEffect(() => {
    setExpandedMatchKeys([]);
  }, [
    matchLengthMax,
    matchLengthMin,
    ratingFilterType,
    ratingMax,
    ratingMin,
    selectedMode,
    sourceFilters,
    player1Filter,
    player2Filter,
    startDateFilter,
    endDateFilter,
  ]);

  useEffect(() => {
    setMatchLengthMin(Math.max(defaultMatchLengthMin, appliedMatchBounds.min));
    setMatchLengthMax(Math.min(defaultMatchLengthMax, appliedMatchBounds.max));
  }, [selectedMode, appliedMatchBounds.max, appliedMatchBounds.min]);

  const startDateTs = useMemo(
    () => parseDateInputBoundary(startDateFilter, "start"),
    [startDateFilter],
  );
  const endDateTs = useMemo(() => parseDateInputBoundary(endDateFilter, "end"), [endDateFilter]);

  const filteredMatches = useMemo(
    () =>
      matches.filter((match) => {
        if (startDateTs !== null && match.startTs < startDateTs) return false;
        if (endDateTs !== null && match.startTs > endDateTs) return false;

        if (match.gameCount < matchLengthMin || match.gameCount > matchLengthMax) {
          return false;
        }

        if (ratingFilterType === "average") {
          if (Number.isFinite(match.avgRating)) {
            const inAverageRange = match.avgRating >= ratingMin && match.avgRating <= ratingMax;
            if (!inAverageRange) return false;
          }
        } else if (Number.isFinite(match.playerARating) && Number.isFinite(match.playerBRating)) {
          const bothInRange =
            match.playerARating >= ratingMin &&
            match.playerARating <= ratingMax &&
            match.playerBRating >= ratingMin &&
            match.playerBRating <= ratingMax;
          if (!bothInRange) return false;
        }

        const playerAName = match.playerA.toLowerCase();
        const playerBName = match.playerB.toLowerCase();
        const first = player1Filter.trim().toLowerCase();
        const second = player2Filter.trim().toLowerCase();

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
        if (!sourceKey || !sourceFilters[sourceKey]) {
          return false;
        }

        return true;
      }),
    [
      matchLengthMax,
      matchLengthMin,
      matches,
      player1Filter,
      player2Filter,
      ratingFilterType,
      ratingMax,
      ratingMin,
      startDateTs,
      endDateTs,
      sourceFilters,
    ],
  );
  const totalPages = Math.max(1, Math.ceil(filteredMatches.length / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [
    selectedMode,
    matchLengthMin,
    matchLengthMax,
    ratingFilterType,
    ratingMin,
    ratingMax,
    player1Filter,
    player2Filter,
    sourceFilters,
    startDateFilter,
    endDateFilter,
    pageSize,
  ]);

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paginatedMatches = useMemo(() => {
    const offset = (currentPage - 1) * pageSize;
    return filteredMatches.slice(offset, offset + pageSize);
  }, [currentPage, filteredMatches, pageSize]);

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

        <div className="profileBackLinkWrap">
          <a className="rankingLink" href="/rankings">
            ← Back to rankings
          </a>
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
                    <a
                      className="rankingLink"
                      href={`/rankings/${encodeURIComponent(match.playerA)}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {match.playerA}
                    </a>
                    <span>vs</span>
                    <a
                      className="rankingLink"
                      href={`/rankings/${encodeURIComponent(match.playerB)}`}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {match.playerB}
                    </a>
                  </div>
                  <div className="scoreCell">
                    <span>{formatScore(match.scoreA)}</span>
                    <span className="scoreDash"> - </span>
                    <span>{formatScore(match.scoreB)}</span>
                  </div>
                </div>
                <div className="matchCardMeta">
                  <span>{formatLocalDateTime(match.startTs)}</span>
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
                              ? formatSigned(match.playerAAfterRating - match.playerABeforeRating)
                              : "—"
                          })`}
                        </span>
                        <span>
                          {`RD ${Number.isFinite(match.playerABeforeRd) ? match.playerABeforeRd.toFixed(1) : "—"} (${
                            Number.isFinite(match.playerAAfterRd) &&
                            Number.isFinite(match.playerABeforeRd)
                              ? formatSigned(match.playerAAfterRd - match.playerABeforeRd)
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
                              ? formatSigned(match.playerBAfterRating - match.playerBBeforeRating)
                              : "—"
                          })`}
                        </span>
                        <span>
                          {`RD ${Number.isFinite(match.playerBBeforeRd) ? match.playerBBeforeRd.toFixed(1) : "—"} (${
                            Number.isFinite(match.playerBAfterRd) &&
                            Number.isFinite(match.playerBBeforeRd)
                              ? formatSigned(match.playerBAfterRd - match.playerBBeforeRd)
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
