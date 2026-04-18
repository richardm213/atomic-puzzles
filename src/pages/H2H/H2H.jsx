import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import "./H2H.css";
import { defaultSourceFilters, modeLabels, modeOptions, knownSourceKeys } from "../../constants/matches";
import { loadRawMatchesByMode } from "../../lib/matchData";
import { fetchPlayerRatingsRows } from "../../lib/supabasePlayerRatings";
import { resolveUsernameInputs } from "../../lib/searchUsernames";
import { getTimeControlOptions } from "../../hooks/usePlayerProfileData";
import { parseDateInputBoundary } from "../../utils/matchFilters";
import { normalizedGamesFromMatch, normalizedPlayersFromMatch } from "../../utils/matchTransforms";
import { formatLocalDateTime, formatScore } from "../../utils/formatters";
import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { MatchDetails } from "../../components/MatchDetails/MatchDetails";
import { SourceFilterChecks } from "../../components/SourceFilterChecks/SourceFilterChecks";
import { Seo } from "../../components/Seo/Seo";
import {
  ratingsForPlayers,
  sourceKeyFromMatch,
  summarizeMatchGames,
} from "../../lib/matchSummaries";

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
      const { scoreA, scoreB, mappedGames } = summarizeMatchGames(games, resolvedA, resolvedB);
      const winner = scoreA === scoreB ? "Draw" : scoreA > scoreB ? resolvedA : resolvedB;
      const firstGameId = String(games[0]?.id || "—");
      const firstGame = games[0];

      return {
        key: `${mode}-${match?.match_id || match?.start_ts || ""}-${firstGameId}-${resolvedA}-${resolvedB}`,
        mode,
        startTs: Number(match?.start_ts ?? match?.s),
        timeControl: String(match?.time_control ?? match?.t ?? "—"),
        source: sourceKeyFromMatch(match, firstGame),
        playerA: resolvedA,
        playerB: resolvedB,
        scoreA,
        scoreB,
        winner,
        firstGameId,
        games: mappedGames,
        ...ratingsForPlayers(match, players, resolvedA, resolvedB),
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

const modeStatLabels = {
  rank: "Rank",
  rating: "Rating",
  rd: "RD",
  peak: "Peak",
};
const sourceLabels = {
  arena: "Arena",
  friend: "Friend",
  lobby: "Lobby",
  unknown: "Other",
};

const matchSlugSeparator = "-vs-";
const indexRatingsRowsByTimeControl = (rows) => {
  const snapshots = {};

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const timeControl = String(row?.tc || "").toLowerCase();
    if (!timeControl) return;
    snapshots[timeControl] = row;
  });

  return snapshots;
};

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
    sources: defaultSourceFilters,
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
        if (knownSourceKeys.includes(match.source)) return filters.sources[match.source];

        return true;
      }),
    [endDateTs, filters, matches, startDateTs],
  );

  const { initialOptions, incrementOptions } = useMemo(() => getTimeControlOptions(matches), [matches]);
  const timeControlOptions = useMemo(() => {
    const known = new Set(matches.map((match) => match.timeControl));
    return initialOptions.flatMap((initial) =>
      incrementOptions
        .map((increment) => `${initial}+${increment}`)
        .filter((timeControl) => known.has(timeControl)),
    );
  }, [incrementOptions, initialOptions, matches]);

  const scoresByMode = useMemo(
    () =>
      Object.fromEntries(
        modeOptions.map((mode) => [
          mode,
          computeGameScore(filteredMatches.filter((match) => match.mode === mode)),
        ]),
      ),
    [filteredMatches],
  );
  const combinedScore = useMemo(
    () => ({
      playerA: modeOptions.reduce((sum, mode) => sum + (scoresByMode[mode]?.playerA ?? 0), 0),
      playerB: modeOptions.reduce((sum, mode) => sum + (scoresByMode[mode]?.playerB ?? 0), 0),
    }),
    [scoresByMode],
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
      const [resolvedFirst, resolvedSecond] = await resolveUsernameInputs([first, second]);
      if (requestId !== searchRequestIdRef.current) return;

      const loadModeMatches = async (mode) =>
        loadRawMatchesByMode(mode, { filters: { usernamePair: [resolvedFirst, resolvedSecond] } });
      const loadPlayerSnapshot = async (username) => fetchPlayerRatingsRows({ username });

      const [modeResults, firstRatings, secondRatings] = await Promise.all([
        Promise.all(modeOptions.map((mode) => loadModeMatches(mode))),
        loadPlayerSnapshot(resolvedFirst),
        loadPlayerSnapshot(resolvedSecond),
      ]);
      if (requestId !== searchRequestIdRef.current) return;

      const merged = modeResults
        .flatMap((rawMatches, index) =>
          normalizeH2HMatches(rawMatches, modeOptions[index], resolvedFirst, resolvedSecond),
        )
        .sort((a, b) => b.startTs - a.startTs);

      setLoadedPlayer1(resolvedFirst);
      setLoadedPlayer2(resolvedSecond);
      setMatches(merged);
      setPlayerSnapshots({
        [resolvedFirst.toLowerCase()]: indexRatingsRowsByTimeControl(firstRatings),
        [resolvedSecond.toLowerCase()]: indexRatingsRowsByTimeControl(secondRatings),
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

      const [resolvedFirst, resolvedSecond] = await resolveUsernameInputs([first, second]);

      await navigate({
        to: "/h2h/$matchup",
        params: {
          matchup: matchupToSlug(resolvedFirst, resolvedSecond),
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

  const winsPlayer1 = filteredMatches.filter((match) => match.winner === loadedPlayer1).length;
  const winsPlayer2 = filteredMatches.filter((match) => match.winner === loadedPlayer2).length;
  const draws = filteredMatches.filter((match) => match.winner === "Draw").length;
  const lastMatch = filteredMatches[0] || null;
  const seoPath =
    loadedPlayer1 && loadedPlayer2 ? `/h2h/${matchupToSlug(loadedPlayer1, loadedPlayer2)}` : "/h2h";
  const seoTitle =
    loadedPlayer1 && loadedPlayer2
      ? `${loadedPlayer1} vs ${loadedPlayer2} Atomic Chess Head-to-Head`
      : "Atomic Chess Head-to-Head";
  const seoDescription =
    loadedPlayer1 && loadedPlayer2
      ? `Compare ${loadedPlayer1} and ${loadedPlayer2} across atomic chess matches, scores, and blitz, bullet, and hyperbullet splits.`
      : "Compare two atomic chess players side by side across recent results, total score, and time-control splits.";

  return (
    <div className="rankingsPage">
      <Seo title={seoTitle} description={seoDescription} path={seoPath} />
      <div className="panel rankingsPanel h2hPanel">
        <section className="h2hHero">
          <div className="h2hHeroCopy">
            <span className="h2hEyebrow">Head to Head</span>
            <h1>See how two players stack up.</h1>
            <p>
              Compare overall score, blitz, bullet, and hyperbullet splits, and every match in the rivalry.
            </p>
          </div>

          <div className="h2hSearchCard">
            <form
              className="controls rankingsControls profileControls h2hSearchForm"
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
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
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
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="username"
                  value={player2Input}
                  onChange={(event) => setPlayer2Input(event.target.value)}
                />
              </label>
              <button className="analyzeButton h2hSearchButton" type="submit" disabled={loading}>
                {loading ? "Searching..." : "Compare Players"}
              </button>
            </form>
          </div>
        </section>

        {!hasSearched ? (
          <div className="emptyRankings h2hEmptyState">
            Enter two usernames to load the matchup overview.
          </div>
        ) : null}
        {error ? <div className="errorText">{error}</div> : null}

        {hasSearched && loadedPlayer1 && loadedPlayer2 ? (
          <>
            <section className="h2hSummaryShell">
              <div className="h2hSummaryBar">
                <div className="h2hSummaryPill">
                  <span>Matches</span>
                  <strong>{filteredMatches.length}</strong>
                </div>
                <div className="h2hSummaryPill">
                  <span>{loadedPlayer1} wins</span>
                  <strong>{winsPlayer1}</strong>
                </div>
                <div className="h2hSummaryPill">
                  <span>{loadedPlayer2} wins</span>
                  <strong>{winsPlayer2}</strong>
                </div>
                <div className="h2hSummaryPill">
                  <span>Draws</span>
                  <strong>{draws}</strong>
                </div>
                <div className="h2hSummaryPill">
                  <span>Latest</span>
                  <strong>{lastMatch ? formatLocalDateTime(lastMatch.startTs) : "—"}</strong>
                </div>
              </div>

              <div className="h2hFilterCard">
                <div className="h2hSectionHeading">
                  <h2>Refine Matchup</h2>
                  <p>Trim the rivalry down by date, source, and time control.</p>
                </div>

                <div className="controls profileControls h2hFilterGrid">
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

                <SourceFilterChecks values={filters.sources} onChange={setSourceFilter} />
              </div>

              <div className="h2hSplitLayout">
                <section className="h2hPlayerPanel h2hPlayerPanelCombined">
                  <div className="h2hPlayerPanelTop h2hPlayerPanelTopCombined">
                    <div className="h2hPlayerIdentity h2hPlayerIdentityLeft">
                      <span className="h2hPlayerLabel">Player One</span>
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
                    <div className="h2hScoreBlock h2hScoreBlockHero">
                      <h3>Overall Score</h3>
                      <strong className="h2hModeCardScore h2hScoreLine">
                        {formatScore(combinedScore.playerA)} - {formatScore(combinedScore.playerB)}
                      </strong>
                      <span className="h2hScoreCaption">Across all filtered games</span>
                    </div>
                    <div className="h2hPlayerIdentity h2hPlayerIdentityRight">
                      <span className="h2hPlayerLabel">Player Two</span>
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

                  {modeOptions.map((mode) => (
                    <div key={mode} className="h2hModeCard">
                      <div className="h2hModeCardBody h2hModeCardBodyCombined">
                        <div className="h2hModeStatsGroup">
                          {renderModeStats(player1Snapshot[mode] || {})}
                        </div>
                        <div className="h2hScoreBlock">
                          <h3>{modeLabels[mode] ?? mode}</h3>
                          <strong className="h2hModeCardScore h2hScoreLine">
                            {formatScore(scoresByMode[mode]?.playerA ?? 0)} -{" "}
                            {formatScore(scoresByMode[mode]?.playerB ?? 0)}
                          </strong>
                        </div>
                        <div className="h2hModeStatsGroup h2hModeCardRightStats">
                          {renderModeStats(player2Snapshot[mode] || {})}
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              </div>
            </section>

            <section className="h2hHistorySection">
              <div className="h2hSectionHeading">
                <h2>Match History</h2>
                <p>Tap any row or card to expand the game-by-game breakdown.</p>
              </div>

              <div className="h2hHistoryTableWrap">
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
                                <MatchDetails
                                  match={match}
                                  matchKey={match.key}
                                  showRunningScore
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="h2hHistoryCards" aria-label="Match history cards">
                {filteredMatches.map((match) => {
                  const isExpanded = expandedMatchKeys.includes(match.key);
                  return (
                    <article
                      key={`${match.key}-card`}
                      className={`h2hHistoryCard ${isExpanded ? "expanded" : ""}`}
                    >
                      <button
                        type="button"
                        className="h2hHistoryCardButton"
                        onClick={() =>
                          setExpandedMatchKeys((current) =>
                            current.includes(match.key)
                              ? current.filter((key) => key !== match.key)
                              : [...current, match.key],
                          )
                        }
                      >
                        <div className="h2hHistoryCardTop">
                          <span className="h2hHistoryCardKicker">{match.timeControl}</span>
                          <LichessGameLink
                            gameId={match.firstGameId}
                            onClick={(event) => event.stopPropagation()}
                            className="rankingLink h2hHistoryCardDate"
                          >
                            {formatLocalDateTime(match.startTs)}
                          </LichessGameLink>
                        </div>
                        <div className="h2hHistoryCardScore">
                          {formatScore(match.scoreA)} - {formatScore(match.scoreB)}
                        </div>
                        <div className="h2hHistoryCardMeta">
                          <span>Winner: {match.winner}</span>
                          <span>Source: {sourceLabels[match.source] || "Other"}</span>
                        </div>
                      </button>
                      {isExpanded ? (
                        <div className="h2hHistoryCardDetails">
                          <MatchDetails
                            match={match}
                            matchKey={`${match.key}-mobile`}
                            showRunningScore
                          />
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
            {filteredMatches.length === 0 ? (
              <div className="emptyRankings h2hEmptyState">
                No matches found with the current filters.
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
};
