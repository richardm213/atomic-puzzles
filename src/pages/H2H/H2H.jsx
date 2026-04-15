import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import "./H2H.css";
import { loadRawMatchesByMode } from "../../lib/matchData";
import { fetchPlayerRatingsRows } from "../../lib/supabasePlayerRatings";
import { useTimeControlOptions } from "../../hooks/usePlayerProfileData";
import { matchSourceFromValues, parseDateInputBoundary } from "../../utils/matchFilters";
import {
  findRatingDataForPlayer,
  normalizedGamesFromMatch,
  normalizedPlayersFromMatch,
  normalizedRatingsFromMatch,
  winnerToFullWord,
} from "../../utils/matchTransforms";
import { formatLocalDateTime, formatScore, formatSignedDecimal } from "../../utils/formatters";
import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { SourceFilterChecks } from "../../components/SourceFilterChecks/SourceFilterChecks";

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
          scoreAAfter: scoreA,
          scoreBAfter: scoreB,
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
        source: matchSourceFromValues(
          games[0]?.source,
          games[0]?.match_source,
          games[0]?.queue,
          match?.source,
          match?.match_source,
          match?.queue,
        ),
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

const computeGameScore = (matches) => {
  return matches.reduce(
    (accumulator, match) => ({
      playerA: accumulator.playerA + Number(match.scoreA || 0),
      playerB: accumulator.playerB + Number(match.scoreB || 0),
    }),
    { playerA: 0, playerB: 0 },
  );
};

const defaultSources = { arena: true, friend: true, lobby: true };
const knownSources = Object.keys(defaultSources);
const modeStatLabels = {
  rank: "Rank",
  rating: "Rating",
  rd: "RD",
  peak: "Peak",
};

const matchSlugSeparator = "-vs-";

const matchupToSlug = (player1, player2) =>
  `${encodeURIComponent(player1)}${matchSlugSeparator}${encodeURIComponent(player2)}`;

const parseMatchupSlug = (matchup) => {
  const separatorIndex = String(matchup || "").indexOf(matchSlugSeparator);
  if (separatorIndex <= 0) return null;
  const player1Part = matchup.slice(0, separatorIndex);
  const player2Part = matchup.slice(separatorIndex + matchSlugSeparator.length);
  if (!player1Part || !player2Part) return null;

  try {
    return {
      player1: decodeURIComponent(player1Part),
      player2: decodeURIComponent(player2Part),
    };
  } catch {
    return null;
  }
};

export const H2HPage = () => {
  const navigate = useNavigate();
  const { matchup } = useParams({ strict: false });
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
  const searchRequestIdRef = useRef(0);
  const searchSubmitInFlightRef = useRef(false);

  const startDateTs = useMemo(() => parseDateInputBoundary(filters.startDate, "start"), [filters]);
  const endDateTs = useMemo(() => parseDateInputBoundary(filters.endDate, "end"), [filters]);

  const filteredMatches = useMemo(
    () =>
      matches.filter((match) => {
        if (match.startTs < startDateTs || match.startTs > endDateTs) return false;
        if (filters.timeControl !== "all" && match.timeControl !== filters.timeControl)
          return false;

        if (match.source === "unknown") return Object.values(filters.sources).some(Boolean);
        if (knownSources.includes(match.source)) return filters.sources[match.source];

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
  const blitzScore = useMemo(() => computeGameScore(blitzMatches), [blitzMatches]);
  const bulletScore = useMemo(() => computeGameScore(bulletMatches), [bulletMatches]);
  const combinedScore = useMemo(
    () => ({
      playerA: blitzScore.playerA + bulletScore.playerA,
      playerB: blitzScore.playerB + bulletScore.playerB,
    }),
    [blitzScore.playerA, blitzScore.playerB, bulletScore.playerA, bulletScore.playerB],
  );

  const performSearch = useCallback(async (first, second) => {
    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;

    if (!first || !second) {
      setError("Enter both usernames to search head-to-head.");
      setHasSearched(true);
      setMatches([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);
    setExpandedMatchKeys([]);
    setError("");

    try {
      const loadModeMatches = async (mode) =>
        loadRawMatchesByMode(mode, { filters: { usernamePair: [first, second] } });
      const loadPlayerSnapshot = async (username) => fetchPlayerRatingsRows({ username });

      const [blitzRaw, bulletRaw, firstRatings, secondRatings] = await Promise.all([
        loadModeMatches("blitz"),
        loadModeMatches("bullet"),
        loadPlayerSnapshot(first),
        loadPlayerSnapshot(second),
      ]);
      if (requestId !== searchRequestIdRef.current) return;

      const blitzNormalized = normalizeH2HMatches(blitzRaw, "blitz", first, second);
      const bulletNormalized = normalizeH2HMatches(bulletRaw, "bullet", first, second);
      const merged = [...blitzNormalized, ...bulletNormalized].sort(
        (a, b) => b.startTs - a.startTs,
      );

      setLoadedPlayer1(first);
      setLoadedPlayer2(second);
      setMatches(merged);
      const byTc = (rows) =>
        (Array.isArray(rows) ? rows : []).reduce(
          (acc, row) => ({ ...acc, [String(row?.tc || "").toLowerCase()]: row }),
          {},
        );
      setPlayerSnapshots({
        [first.toLowerCase()]: byTc(firstRatings),
        [second.toLowerCase()]: byTc(secondRatings),
      });
      if (!merged.length) {
        setError("No head-to-head matches found for the selected players.");
      }
    } catch (loadError) {
      if (requestId !== searchRequestIdRef.current) return;
      setMatches([]);
      setError(String(loadError));
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleSearch = async () => {
    if (searchSubmitInFlightRef.current || loading) return;

    const first = player1Input.trim();
    const second = player2Input.trim();
    searchSubmitInFlightRef.current = true;
    try {
      if (!first || !second) {
        await performSearch(first, second);
        return;
      }

      await navigate({
        to: "/h2h/$matchup",
        params: {
          matchup: matchupToSlug(first, second),
        },
      });
    } finally {
      searchSubmitInFlightRef.current = false;
    }
  };

  useEffect(() => {
    const parsedMatchup = parseMatchupSlug(matchup);
    if (!parsedMatchup) return;

    const { player1, player2 } = parsedMatchup;
    setPlayer1Input(player1);
    setPlayer2Input(player2);
    performSearch(player1.trim(), player2.trim());
  }, [matchup, performSearch]);

  const player1Snapshot = playerSnapshots[loadedPlayer1.toLowerCase()] || {};
  const player2Snapshot = playerSnapshots[loadedPlayer2.toLowerCase()] || {};
  const setSourceFilter = (source, checked) => {
    setFilters((current) => ({
      ...current,
      sources: { ...current.sources, [source]: checked },
    }));
  };

  const renderModeStats = (modeData) => (
    <>
      {["rank", "rating", "rd", "peak"].map((key) => (
        <p key={key} className="h2hModeMeta">
          <span>{modeStatLabels[key]}: </span>
          <strong>{modeData[key] || "—"}</strong>
        </p>
      ))}
    </>
  );

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel h2hPanel">
        <h1>Head to Head</h1>
        <p>Compare two players, then inspect score splits and full match history.</p>

        <form
          className="controls rankingsControls profileControls"
          onSubmit={(event) => {
            event.preventDefault();
            handleSearch();
          }}
        >
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
          <button className="analyzeButton" type="submit" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {!hasSearched ? (
          <div className="emptyRankings">Enter two usernames and press search.</div>
        ) : null}
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
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </label>
              <label htmlFor="h2h-end-date-filter">
                To
                <input
                  id="h2h-end-date-filter"
                  type="date"
                  value={filters.endDate}
                  min={filters.startDate || undefined}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, endDate: event.target.value }))
                  }
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
              <section className="h2hPlayerPanel h2hPlayerPanelCombined">
                <div className="h2hPlayerPanelTop h2hPlayerPanelTopCombined">
                  <div className="h2hPlayerIdentity h2hPlayerIdentityLeft">
                    <h2>
                      <Link
                        className="rankingLink h2hPlayerNameLink"
                        to="/@/$username"
                        params={{ username: loadedPlayer1 }}
                      >
                        {loadedPlayer1}
                      </Link>
                    </h2>
                  </div>
                  <div className="h2hScoreBlock">
                    <h3>Overall</h3>
                    <strong className="h2hModeCardScore h2hScoreLine">
                      {formatScore(combinedScore.playerA)} - {formatScore(combinedScore.playerB)}
                    </strong>
                  </div>
                  <div className="h2hPlayerIdentity h2hPlayerIdentityRight">
                    <h2>
                      <Link
                        className="rankingLink h2hPlayerNameLink"
                        to="/@/$username"
                        params={{ username: loadedPlayer2 }}
                      >
                        {loadedPlayer2}
                      </Link>
                    </h2>
                  </div>
                </div>

                <div className="h2hModeCard">
                  <div className="h2hModeCardBody h2hModeCardBodyCombined">
                    <div>{renderModeStats(player1Snapshot.blitz || {})}</div>
                    <div className="h2hScoreBlock">
                      <h3>Blitz</h3>
                      <strong className="h2hModeCardScore h2hScoreLine">
                        {formatScore(blitzScore.playerA)} - {formatScore(blitzScore.playerB)}
                      </strong>
                    </div>
                    <div className="h2hModeCardRightStats">
                      {renderModeStats(player2Snapshot.blitz || {})}
                    </div>
                  </div>
                </div>

                <div className="h2hModeCard">
                  <div className="h2hModeCardBody h2hModeCardBodyCombined">
                    <div>{renderModeStats(player1Snapshot.bullet || {})}</div>
                    <div className="h2hScoreBlock">
                      <h3>Bullet</h3>
                      <strong className="h2hModeCardScore h2hScoreLine">
                        {formatScore(bulletScore.playerA)} - {formatScore(bulletScore.playerB)}
                      </strong>
                    </div>
                    <div className="h2hModeCardRightStats">
                      {renderModeStats(player2Snapshot.bullet || {})}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <h2>Match History</h2>
            <SourceFilterChecks values={filters.sources} onChange={setSourceFilter} />

            <table className="h2hHistoryTable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>TC</th>
                  <th>Winner</th>
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
                          <LichessGameLink
                            gameId={match.firstGameId}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {formatLocalDateTime(match.startTs)}
                          </LichessGameLink>
                        </td>
                        <td>{match.timeControl}</td>
                        <td>{match.winner}</td>
                        <td>
                          {formatScore(match.scoreA)} - {formatScore(match.scoreB)}
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="h2hHistoryDetailsRow">
                          <td colSpan={4}>
                            <div className="matchCardPlayerStats">
                              <div>
                                <strong>{match.playerA}</strong>
                                <span>
                                  Rating {match.playerABeforeRating} (
                                  {formatSignedDecimal(
                                    match.playerAAfterRating - match.playerABeforeRating,
                                  )}
                                  )
                                </span>
                                <span>
                                  RD {match.playerABeforeRd} (
                                  {formatSignedDecimal(
                                    match.playerAAfterRd - match.playerABeforeRd,
                                  )}
                                  )
                                </span>
                              </div>
                              <div>
                                <strong>{match.playerB}</strong>
                                <span>
                                  Rating {match.playerBBeforeRating} (
                                  {formatSignedDecimal(
                                    match.playerBAfterRating - match.playerBBeforeRating,
                                  )}
                                  )
                                </span>
                                <span>
                                  RD {match.playerBBeforeRd} (
                                  {formatSignedDecimal(
                                    match.playerBAfterRd - match.playerBBeforeRd,
                                  )}
                                  )
                                </span>
                              </div>
                            </div>
                            <div className="matchGamesHeader">
                              <strong>Game</strong>
                              <strong>Result</strong>
                              <strong>Score</strong>
                              <strong>ID</strong>
                            </div>
                            <ul className="matchGamesList">
                              {match.games.map((game) => (
                                <li
                                  key={`${match.key}-${game.id}-${game.index}`}
                                  className="matchGameRow"
                                >
                                  <span>Game {game.index + 1}</span>
                                  <span>{game.resultLabel}</span>
                                  <span>{`${formatScore(game.scoreAAfter)} - ${formatScore(
                                    game.scoreBAfter,
                                  )}`}</span>
                                  <span>
                                    <LichessGameLink gameId={game.id}>{game.id}</LichessGameLink>
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
