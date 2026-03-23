import { useEffect, useMemo, useState } from "react";

const opponentRatingSliderMin = 1500;
const opponentRatingSliderMax = 2500;
const matchLengthBoundsByMode = {
  blitz: { min: 1, max: 50 },
  bullet: { min: 1, max: 200 },
};
const recentModeOptions = ["blitz", "bullet", "all"];

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

const recentJsonUrlCandidates = (mode) => [
  `/private/${mode}_matches.json`,
  `/data/${mode}_matches.json`,
  `https://raw.githubusercontent.com/atomicchess/atomic-rankings/main/data/${mode}_matches.json`,
  `https://raw.githubusercontent.com/atomaire/atomic-rankings/main/data/${mode}_matches.json`,
];

const loadRawRecentMatchesByMode = async (mode) => {
  if (mode === "all") {
    const [blitzMatches, bulletMatches] = await Promise.all([
      loadRawRecentMatchesByMode("blitz"),
      loadRawRecentMatchesByMode("bullet"),
    ]);
    return [...blitzMatches, ...bulletMatches];
  }

  const candidates = recentJsonUrlCandidates(mode);
  let loaded = null;
  let lastError = null;

  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      loaded = await response.json();
      break;
    } catch (fetchError) {
      lastError = fetchError;
    }
  }

  if (!loaded) {
    throw new Error(
      `Could not load ${mode} recent history from atomic-rankings sources (${String(lastError)})`,
    );
  }

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

      const mappedGames = games.map((game, index) => {
        const white = String(game?.white || "").toLowerCase();
        const black = String(game?.black || "").toLowerCase();
        const winner = game?.winner;
        let resultForA = "draw";

        if (winner === "white") {
          if (white === playerALower) {
            scoreA += 1;
            resultForA = "win";
          } else {
            scoreB += 1;
            resultForA = "loss";
          }
        } else if (winner === "black") {
          if (black === playerALower) {
            scoreA += 1;
            resultForA = "win";
          } else {
            scoreB += 1;
            resultForA = "loss";
          }
        } else {
          scoreA += 0.5;
          scoreB += 0.5;
        }

        return {
          id: String(game?.id || "—"),
          resultForA,
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
  const [error, setError] = useState("");
  const [expandedMatchKeys, setExpandedMatchKeys] = useState([]);
  const [averageRatingMin, setAverageRatingMin] = useState(opponentRatingSliderMin);
  const [averageRatingMax, setAverageRatingMax] = useState(opponentRatingSliderMax);
  const [playerRatingMin, setPlayerRatingMin] = useState(opponentRatingSliderMin);
  const [playerRatingMax, setPlayerRatingMax] = useState(opponentRatingSliderMax);
  const initialMatchBounds = matchLengthBoundsByMode.blitz;
  const [matchLengthMin, setMatchLengthMin] = useState(initialMatchBounds.min);
  const [matchLengthMax, setMatchLengthMax] = useState(initialMatchBounds.max);
  const modeBounds = matchLengthBoundsByMode[selectedMode] ?? matchLengthBoundsByMode.blitz;
  const appliedMatchBounds = selectedMode === "all" ? matchLengthBoundsByMode.bullet : modeBounds;

  useEffect(() => {
    const loadMatches = async () => {
      setError("");
      try {
        const loaded = await loadRawRecentMatchesByMode(selectedMode);
        const normalized =
          selectedMode === "all"
            ? normalizeRecentMatches(loaded, "mixed")
            : normalizeRecentMatches(loaded, selectedMode);
        setMatches(normalized);
      } catch (loadError) {
        setMatches([]);
        setError(String(loadError));
      }
    };

    loadMatches();
  }, [selectedMode]);

  useEffect(() => {
    setExpandedMatchKeys([]);
  }, [
    averageRatingMax,
    averageRatingMin,
    matchLengthMax,
    matchLengthMin,
    playerRatingMax,
    playerRatingMin,
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

        if (Number.isFinite(match.avgRating)) {
          const inAverageRange =
            match.avgRating >= averageRatingMin && match.avgRating <= averageRatingMax;
          if (!inAverageRange) return false;
        }

        if (Number.isFinite(match.playerARating) && Number.isFinite(match.playerBRating)) {
          const bothInRange =
            match.playerARating >= playerRatingMin &&
            match.playerARating <= playerRatingMax &&
            match.playerBRating >= playerRatingMin &&
            match.playerBRating <= playerRatingMax;
          if (!bothInRange) return false;
        }

        return true;
      }),
    [
      averageRatingMax,
      averageRatingMin,
      matchLengthMax,
      matchLengthMin,
      matches,
      playerRatingMax,
      playerRatingMin,
    ],
  );

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel">
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
          <label htmlFor="recent-average-rating-min">
            Average rating range: {averageRatingMin} - {averageRatingMax}
          </label>
          <div className="dualRangeSlider">
            <div className="dualRangeTrack" />
            <div
              className="dualRangeSelected"
              style={{
                left: `${((averageRatingMin - opponentRatingSliderMin) / (opponentRatingSliderMax - opponentRatingSliderMin)) * 100}%`,
                right: `${100 - ((averageRatingMax - opponentRatingSliderMin) / (opponentRatingSliderMax - opponentRatingSliderMin)) * 100}%`,
              }}
            />
            <input
              id="recent-average-rating-min"
              className="dualRangeInput"
              type="range"
              min={opponentRatingSliderMin}
              max={opponentRatingSliderMax}
              step={10}
              value={averageRatingMin}
              onChange={(event) => {
                const nextMin = Number(event.target.value);
                setAverageRatingMin(Math.min(nextMin, averageRatingMax));
              }}
            />
            <input
              className="dualRangeInput"
              type="range"
              min={opponentRatingSliderMin}
              max={opponentRatingSliderMax}
              step={10}
              value={averageRatingMax}
              onChange={(event) => {
                const nextMax = Number(event.target.value);
                setAverageRatingMax(Math.max(nextMax, averageRatingMin));
              }}
            />
          </div>
        </div>

        <div className="opponentRatingFilter">
          <label htmlFor="recent-player-rating-min">
            Player rating range (both players): {playerRatingMin} - {playerRatingMax}
          </label>
          <div className="dualRangeSlider">
            <div className="dualRangeTrack" />
            <div
              className="dualRangeSelected"
              style={{
                left: `${((playerRatingMin - opponentRatingSliderMin) / (opponentRatingSliderMax - opponentRatingSliderMin)) * 100}%`,
                right: `${100 - ((playerRatingMax - opponentRatingSliderMin) / (opponentRatingSliderMax - opponentRatingSliderMin)) * 100}%`,
              }}
            />
            <input
              id="recent-player-rating-min"
              className="dualRangeInput"
              type="range"
              min={opponentRatingSliderMin}
              max={opponentRatingSliderMax}
              step={10}
              value={playerRatingMin}
              onChange={(event) => {
                const nextMin = Number(event.target.value);
                setPlayerRatingMin(Math.min(nextMin, playerRatingMax));
              }}
            />
            <input
              className="dualRangeInput"
              type="range"
              min={opponentRatingSliderMin}
              max={opponentRatingSliderMax}
              step={10}
              value={playerRatingMax}
              onChange={(event) => {
                const nextMax = Number(event.target.value);
                setPlayerRatingMax(Math.max(nextMax, playerRatingMin));
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
          {filteredMatches.map((match) => {
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
                    <strong>Games</strong>
                    <ul>
                      {match.games.map((game) => (
                        <li key={`${matchKey}-${game.id}-${game.index}`}>
                          Game {game.index + 1}: {game.resultForA} ({formatScore(game.scoreAAfter)} - {formatScore(game.scoreBAfter)}) •
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
      </div>
    </div>
  );
};
