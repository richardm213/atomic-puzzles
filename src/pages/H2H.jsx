import { Fragment, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { loadRawMatchesByMode } from "../lib/matchData";
import { fetchPlayerRatingsRows } from "../lib/supabasePlayerRatings";
import { useTimeControlOptions } from "../hooks/usePlayerProfileData";
import {
  findRatingDataForPlayer,
  normalizedGamesFromMatch,
  normalizedPlayersFromMatch,
  normalizedRatingsFromMatch,
  winnerToFullWord,
} from "../utils/matchTransforms";
import { formatLocalDateTime, formatScore, formatSignedDecimal } from "../utils/formatters";

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

const normalizeSource = (match, firstGame) => {
  const sourceValue = [
    firstGame?.source,
    firstGame?.match_source,
    firstGame?.queue,
    match?.source,
    match?.match_source,
    match?.queue,
  ].find((value) => value !== undefined && value !== null && String(value).trim().length > 0);

  if (sourceValue === undefined || sourceValue === null || String(sourceValue).trim().length === 0) {
    return "unknown";
  }

  const normalizedSource = String(sourceValue).toLowerCase();
  if (normalizedSource.includes("arena")) return "arena";
  if (normalizedSource.includes("friend")) return "friend";
  if (normalizedSource.includes("lobby")) return "lobby";
  return "unknown";
};

const normalizeH2HMatches = (matches, mode, playerA, playerB) => {
  const playerALower = playerA.toLowerCase();
  const playerBLower = playerB.toLowerCase();

  return (Array.isArray(matches) ? matches : [])
    .map((match) => {
      const players = normalizedPlayersFromMatch(match);
      const includesBoth =
        players.some((player) => String(player).toLowerCase() === playerALower) &&
        players.some((player) => String(player).toLowerCase() === playerBLower);
      if (!includesBoth) return null;

      const resolvedA =
        players.find((player) => String(player).toLowerCase() === playerALower) || playerA;
      const resolvedB =
        players.find((player) => String(player).toLowerCase() === playerBLower) || playerB;
      const games = normalizedGamesFromMatch(match, players);
      let scoreA = 0;
      let scoreB = 0;

      const mappedGames = games.map((game, index) => {
        const white = String(game?.white || "").toLowerCase();
        const black = String(game?.black || "").toLowerCase();
        const winner = winnerToFullWord(game?.winner);
        let resultLabel = "draw";

        if (winner === "white") {
          if (white === String(resolvedA).toLowerCase()) {
            scoreA += 1;
            resultLabel = resolvedA;
          } else {
            scoreB += 1;
            resultLabel = resolvedB;
          }
        } else if (winner === "black") {
          if (black === String(resolvedA).toLowerCase()) {
            scoreA += 1;
            resultLabel = resolvedA;
          } else {
            scoreB += 1;
            resultLabel = resolvedB;
          }
        } else {
          scoreA += 0.5;
          scoreB += 0.5;
        }

        return {
          id: String(game?.id || "—"),
          index,
          resultLabel,
        };
      });

      const winner = scoreA === scoreB ? "Draw" : scoreA > scoreB ? resolvedA : resolvedB;
      const ratings = normalizedRatingsFromMatch(match, players);
      const playerARatingData = findRatingDataForPlayer(ratings, resolvedA);
      const playerBRatingData = findRatingDataForPlayer(ratings, resolvedB);
      const firstGameId = String(games[0]?.id || "—");

      return {
        key: `${mode}-${match?.match_id || match?.start_ts || ""}-${firstGameId}-${resolvedA}-${resolvedB}`,
        mode,
        startTs: Number(match?.start_ts ?? match?.s),
        timeControl: String(match?.time_control ?? match?.t ?? "—"),
        source: normalizeSource(match, games[0]),
        playerA: resolvedA,
        playerB: resolvedB,
        scoreA,
        scoreB,
        winner,
        firstGameId,
        games: mappedGames,
        playerABeforeRating: Number(playerARatingData?.before_rating),
        playerAAfterRating: Number(playerARatingData?.after_rating),
        playerABeforeRd: Number(playerARatingData?.before_rd),
        playerAAfterRd: Number(playerARatingData?.after_rd),
        playerBBeforeRating: Number(playerBRatingData?.before_rating),
        playerBAfterRating: Number(playerBRatingData?.after_rating),
        playerBBeforeRd: Number(playerBRatingData?.before_rd),
        playerBAfterRd: Number(playerBRatingData?.after_rd),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.startTs - a.startTs);
};

const canonicalMatchKey = (match) => {
  const players = normalizedPlayersFromMatch(match)
    .map((player) => String(player || "").toLowerCase())
    .sort()
    .join("|");
  return String(
    match?.match_id ||
      `${match?.start_ts ?? match?.s}-${match?.end_ts ?? match?.e}-${match?.time_control ?? match?.t}-${players}`,
  );
};

const loadH2HMatchesByMode = async (mode, playerA, playerB) => {
  const [playerAMatches, playerBMatches] = await Promise.all([
    loadRawMatchesByMode(mode, { filters: { username: playerA } }),
    loadRawMatchesByMode(mode, { filters: { username: playerB } }),
  ]);

  const playerBMatchKeys = new Set((Array.isArray(playerBMatches) ? playerBMatches : []).map(canonicalMatchKey));
  return (Array.isArray(playerAMatches) ? playerAMatches : []).filter((match) =>
    playerBMatchKeys.has(canonicalMatchKey(match)),
  );
};

const computeMatchWinScore = (matches, playerA, playerB) => {
  const score = { playerA: 0, playerB: 0, draws: 0 };

  matches.forEach((match) => {
    if (match.winner === "Draw") {
      score.draws += 1;
      return;
    }
    if (String(match.winner).toLowerCase() === String(playerA).toLowerCase()) {
      score.playerA += 1;
    } else if (String(match.winner).toLowerCase() === String(playerB).toLowerCase()) {
      score.playerB += 1;
    }
  });

  return score;
};

const defaultSources = { arena: true, friend: true, lobby: true };

export const H2HPage = () => {
  const [player1Input, setPlayer1Input] = useState("");
  const [player2Input, setPlayer2Input] = useState("");
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    timeControl: "all",
    sources: defaultSources,
  });
  const [loadedPlayer1, setLoadedPlayer1] = useState("");
  const [loadedPlayer2, setLoadedPlayer2] = useState("");
  const [playerSnapshots, setPlayerSnapshots] = useState({});
  const [matches, setMatches] = useState([]);
  const [expandedMatchKeys, setExpandedMatchKeys] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const startDateTs = useMemo(() => parseDateInputBoundary(filters.startDate, "start"), [filters]);
  const endDateTs = useMemo(() => parseDateInputBoundary(filters.endDate, "end"), [filters]);

  const filteredMatches = useMemo(
    () =>
      matches.filter((match) => {
        if (match.startTs < startDateTs || match.startTs > endDateTs) return false;
        if (filters.timeControl !== "all" && match.timeControl !== filters.timeControl) return false;

        if (["arena", "friend", "lobby"].includes(match.source) && !filters.sources[match.source]) {
          return false;
        }
        if (match.source === "unknown" && !Object.values(filters.sources).some(Boolean)) {
          return false;
        }

        return true;
      }),
    [endDateTs, filters, matches, startDateTs],
  );

  const { initialOptions, incrementOptions } = useTimeControlOptions(matches);
  const timeControlOptions = useMemo(() => {
    const known = new Set(matches.map((match) => match.timeControl));
    return initialOptions.flatMap((initial) =>
      incrementOptions
        .map((increment) => `${initial}+${increment}`)
        .filter((timeControl) => known.has(timeControl)),
    );
  }, [incrementOptions, initialOptions, matches]);

  const blitzMatches = useMemo(
    () => filteredMatches.filter((match) => match.mode === "blitz"),
    [filteredMatches],
  );
  const bulletMatches = useMemo(
    () => filteredMatches.filter((match) => match.mode === "bullet"),
    [filteredMatches],
  );
  const scoreByTc = useMemo(() => {
    const grouped = new Map();
    filteredMatches.forEach((match) => {
      const score = grouped.get(match.timeControl) || { playerA: 0, playerB: 0, draws: 0 };
      if (match.winner === "Draw") {
        score.draws += 1;
      } else if (String(match.winner).toLowerCase() === String(loadedPlayer1).toLowerCase()) {
        score.playerA += 1;
      } else {
        score.playerB += 1;
      }
      grouped.set(match.timeControl, score);
    });
    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [filteredMatches, loadedPlayer1]);

  const blitzScore = useMemo(
    () => computeMatchWinScore(blitzMatches, loadedPlayer1, loadedPlayer2),
    [blitzMatches, loadedPlayer1, loadedPlayer2],
  );
  const bulletScore = useMemo(
    () => computeMatchWinScore(bulletMatches, loadedPlayer1, loadedPlayer2),
    [bulletMatches, loadedPlayer1, loadedPlayer2],
  );

  const handleSearch = async () => {
    const first = player1Input.trim();
    const second = player2Input.trim();
    if (!first || !second) {
      setError("Enter both usernames to search head-to-head.");
      setHasSearched(true);
      setMatches([]);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setExpandedMatchKeys([]);
    setError("");

    try {
      const [blitzRaw, bulletRaw, firstRatings, secondRatings] = await Promise.all([
        loadH2HMatchesByMode("blitz", first, second),
        loadH2HMatchesByMode("bullet", first, second),
        fetchPlayerRatingsRows({ username: first }),
        fetchPlayerRatingsRows({ username: second }),
      ]);

      const blitzNormalized = normalizeH2HMatches(blitzRaw, "blitz", first, second);
      const bulletNormalized = normalizeH2HMatches(bulletRaw, "bullet", first, second);
      const merged = [...blitzNormalized, ...bulletNormalized].sort((a, b) => b.startTs - a.startTs);

      const byTc = (rows) =>
        (Array.isArray(rows) ? rows : []).reduce(
          (acc, row) => ({ ...acc, [String(row?.tc || "").toLowerCase()]: row }),
          {},
        );

      setLoadedPlayer1(first);
      setLoadedPlayer2(second);
      setMatches(merged);
      setPlayerSnapshots({
        [first.toLowerCase()]: byTc(firstRatings),
        [second.toLowerCase()]: byTc(secondRatings),
      });
      if (!merged.length) {
        setError("No head-to-head matches found for the selected players.");
      }
    } catch (loadError) {
      setMatches([]);
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  };

  const player1Snapshot = playerSnapshots[loadedPlayer1.toLowerCase()] || {};
  const player2Snapshot = playerSnapshots[loadedPlayer2.toLowerCase()] || {};

  const renderPlayerPanel = (name, snapshot, side, modeScores) => (
    <section className={`h2hPlayerPanel ${side === "right" ? "right" : "left"}`}>
      <div className={`h2hPlayerPanelTop ${side === "right" ? "reverse" : ""}`}>
        <div className="h2hPlayerIdentity">
          <h2>
            <Link className="rankingLink" to="/@/$username" params={{ username: name }}>
              {name}
            </Link>
          </h2>
        </div>
        <div className="h2hModeScoreStack">
          <div className="h2hModeScorePill">
            <span>Blitz</span>
            <strong>{modeScores.blitz}</strong>
          </div>
          <div className="h2hModeScorePill">
            <span>Bullet</span>
            <strong>{modeScores.bullet}</strong>
          </div>
        </div>
      </div>
      {["blitz", "bullet"].map((mode) => {
        const modeData = snapshot[mode] || {};
        return (
          <div key={`${name}-${mode}`} className="h2hModeCard">
            <h3>{mode}</h3>
            <p>
              Rank: <strong>{modeData.rank || "—"}</strong>
            </p>
            <p>
              Rating: <strong>{modeData.rating || "—"}</strong>
            </p>
            <p>
              RD: <strong>{modeData.rd || "—"}</strong>
            </p>
            <p>
              Peak: <strong>{modeData.peak || "—"}</strong>
            </p>
          </div>
        );
      })}
    </section>
  );

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel h2hPanel">
        <h1>Head to Head</h1>
        <p>Compare two players, then inspect score splits and full match history.</p>

        <div className="controls rankingsControls profileControls">
          <label htmlFor="h2h-player-1">
            Player 1
            <input
              id="h2h-player-1"
              type="text"
              placeholder="username"
              value={player1Input}
              onChange={(event) => setPlayer1Input(event.target.value)}
            />
          </label>
          <label htmlFor="h2h-player-2">
            Player 2
            <input
              id="h2h-player-2"
              type="text"
              placeholder="username"
              value={player2Input}
              onChange={(event) => setPlayer2Input(event.target.value)}
            />
          </label>
          <button className="analyzeButton" type="button" onClick={handleSearch} disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        {!hasSearched ? <div className="emptyRankings">Enter two usernames and press search.</div> : null}
        {error ? <div className="errorText">{error}</div> : null}

        {hasSearched && loadedPlayer1 && loadedPlayer2 ? (
          <>
            <div className="controls profileControls">
              <label htmlFor="h2h-start-date-filter">
                From
                <input
                  id="h2h-start-date-filter"
                  type="date"
                  value={filters.startDate}
                  onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
                />
              </label>
              <label htmlFor="h2h-end-date-filter">
                To
                <input
                  id="h2h-end-date-filter"
                  type="date"
                  value={filters.endDate}
                  min={filters.startDate || undefined}
                  onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
                />
              </label>
              <label htmlFor="h2h-time-control-filter">
                Time control
                <select
                  id="h2h-time-control-filter"
                  value={filters.timeControl}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, timeControl: event.target.value }))
                  }
                >
                  <option value="all">All</option>
                  {timeControlOptions.map((tc) => (
                    <option key={`tc-${tc}`} value={tc}>
                      {tc}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="h2hSplitLayout">
              {renderPlayerPanel(loadedPlayer1, player1Snapshot, "left", {
                blitz: blitzScore.playerA,
                bullet: bulletScore.playerA,
              })}
              {renderPlayerPanel(loadedPlayer2, player2Snapshot, "right", {
                blitz: blitzScore.playerB,
                bullet: bulletScore.playerB,
              })}
            </div>

            {scoreByTc.length ? (
              <div className="h2hTcScores">
                <h3>By Time Control</h3>
                <ul>
                  {scoreByTc.map(([tc, score]) => (
                    <li key={`score-${tc}`}>
                      <strong>{tc}</strong>: {loadedPlayer1} {score.playerA} - {score.playerB} {loadedPlayer2}
                      {score.draws ? ` (draws ${score.draws})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <h2>Match History</h2>
            <div className="opponentRatingFilter">
              <span className="statusLabel">Source filter</span>
              <div className="sourceFilterChecks">
                {["arena", "friend", "lobby"].map((source) => (
                  <label key={source} className="sourceFilterCheck">
                    <input
                      type="checkbox"
                      checked={filters.sources[source]}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          sources: { ...current.sources, [source]: event.target.checked },
                        }))
                      }
                    />
                    <span>{source}</span>
                  </label>
                ))}
              </div>
            </div>

            <table className="h2hHistoryTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Winner</th>
                  <th>TC</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatches.map((match) => {
                  const isExpanded = expandedMatchKeys.includes(match.key);
                  return (
                    <Fragment key={match.key}>
                      <tr
                        className={`h2hHistoryRow ${isExpanded ? "expanded" : ""}`}
                        onClick={() =>
                          setExpandedMatchKeys((current) =>
                            current.includes(match.key)
                              ? current.filter((key) => key !== match.key)
                              : [...current, match.key],
                          )
                        }
                      >
                        <td>
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
                        </td>
                        <td>{match.winner}</td>
                        <td>{match.timeControl}</td>
                        <td>
                          {match.playerA} {formatScore(match.scoreA)} - {formatScore(match.scoreB)} {match.playerB}
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="h2hHistoryDetailsRow">
                          <td colSpan={4}>
                            <div className="matchCardPlayerStats">
                              <div>
                                <strong>{match.playerA}</strong>
                                <span>
                                  Rating {match.playerABeforeRating} ({formatSignedDecimal(match.playerAAfterRating - match.playerABeforeRating)})
                                </span>
                                <span>
                                  RD {match.playerABeforeRd} ({formatSignedDecimal(match.playerAAfterRd - match.playerABeforeRd)})
                                </span>
                              </div>
                              <div>
                                <strong>{match.playerB}</strong>
                                <span>
                                  Rating {match.playerBBeforeRating} ({formatSignedDecimal(match.playerBAfterRating - match.playerBBeforeRating)})
                                </span>
                                <span>
                                  RD {match.playerBBeforeRd} ({formatSignedDecimal(match.playerBAfterRd - match.playerBBeforeRd)})
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
                                <li key={`${match.key}-${game.id}-${game.index}`} className="matchGameRow">
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
                                      >
                                        {game.id}
                                      </a>
                                    )}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {filteredMatches.length === 0 ? (
              <div className="emptyRankings">No matches found with current filters.</div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};
