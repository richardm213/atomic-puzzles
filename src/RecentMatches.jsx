import { useEffect, useMemo, useState } from "react";

const opponentRatingSliderMin = 1500;
const opponentRatingSliderMax = 2500;
const matchLengthBoundsByMode = {
  blitz: { min: 1, max: 50 },
  bullet: { min: 1, max: 200 },
};
const recentModeOptions = ["blitz", "bullet"];
const ratingFilterTypeOptions = ["both", "average"];
const initialVisibleMatchCount = 100;
const visibleMatchStep = 100;

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
  const matchKey = Object.keys(ratings).find(
    (key) => String(key).toLowerCase() === playerLower,
  );
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
      const playerARating = Number(playerARatingData?.after_rating);
      const playerBRating = Number(playerBRatingData?.after_rating);
      const avgRating =
        Number.isFinite(playerARating) && Number.isFinite(playerBRating)
          ? (playerARating + playerBRating) / 2
          : null;

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
        avgRating,
        gameCount: games.length,
        firstGameId: String(games[0]?.id || "—"),
        games: mappedGames,
      };
    })
    .filter((match) => Number.isFinite(match.startTs))
    .sort((a, b) => b.startTs - a.startTs);

export const RecentMatchesPage = () => {
  const [selectedMode, setSelectedMode] = useState("blitz");
  const [matches, setMatches] = useState([]);
  const [visibleMatchCount, setVisibleMatchCount] = useState(initialVisibleMatchCount);
  const [error, setError] = useState("");
  const [expandedMatchKeys, setExpandedMatchKeys] = useState([]);
  const [ratingFilterType, setRatingFilterType] = useState("both");
  const [ratingMin, setRatingMin] = useState(opponentRatingSliderMin);
  const [ratingMax, setRatingMax] = useState(opponentRatingSliderMax);
  const initialMatchBounds = matchLengthBoundsByMode.blitz;
  const [matchLengthMin, setMatchLengthMin] = useState(initialMatchBounds.min);
  const [matchLengthMax, setMatchLengthMax] = useState(initialMatchBounds.max);
  const modeBounds = matchLengthBoundsByMode[selectedMode] ?? matchLengthBoundsByMode.blitz;
  const appliedMatchBounds = modeBounds;

  useEffect(() => {
    const loadMatches = async () => {
      setError("");
      try {
        const loaded = await loadRawRecentMatchesByMode(selectedMode);
        const normalized = normalizeRecentMatches(loaded, selectedMode);
        setMatches(normalized);
        setVisibleMatchCount(initialVisibleMatchCount);
      } catch (loadError) {
        setMatches([]);
        setVisibleMatchCount(initialVisibleMatchCount);
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
  ]);

  useEffect(() => {
    setMatchLengthMin(appliedMatchBounds.min);
    setMatchLengthMax(appliedMatchBounds.max);
  }, [selectedMode, appliedMatchBounds.max, appliedMatchBounds.min]);

  const filteredMatches = useMemo(
    () =>
      matches.filter((match) => {
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

        return true;
      }),
    [
      matchLengthMax,
      matchLengthMin,
      matches,
      ratingFilterType,
      ratingMax,
      ratingMin,
    ],
  );
  const visibleMatches = useMemo(
    () => filteredMatches.slice(0, visibleMatchCount),
    [filteredMatches, visibleMatchCount],
  );

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
        </div>

        <div className="opponentRatingFilter">
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
            {filteredMatches.length} filtered / {matches.length} total
          </span>
        </div>

        <div className="matchCards">
          {visibleMatches.map((match) => {
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
                </div>
                {isExpanded ? (
                  <div className="matchCardDetails">
                    <div className="matchCardResultSummary">
                      <span>
                        {match.playerA}: {match.playerAWins}
                      </span>
                      <span>draw: {match.draws}</span>
                      <span>
                        {match.playerB}: {match.playerBWins}
                      </span>
                    </div>
                    <strong>Games</strong>
                    <ul>
                      {match.games.map((game) => (
                        <li key={`${matchKey}-${game.id}-${game.index}`}>
                          Game {game.index + 1}: {game.resultLabel} ({formatScore(game.scoreAAfter)} - {formatScore(game.scoreBAfter)}) •
                          {game.id === "—" ? (
                            " —"
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
        {filteredMatches.length > visibleMatches.length ? (
          <div className="profileBackLinkWrap">
            <button
              type="button"
              className="rankingLinkButton"
              onClick={() => setVisibleMatchCount((count) => count + visibleMatchStep)}
            >
              Load more matches
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};
