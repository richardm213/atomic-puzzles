import "./H2H.css";

import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { type Mode, modeLabels, modeOptions, type SourceFilters } from "../../constants/matches";
import type { PlayerRatingRow } from "../../lib/supabase/supabasePlayerRatings";
import type { MatchCardData } from "../../types/matchCard";
import type { RawMatchLike } from "../../types/matchRaw";

type H2HMatch = MatchCardData & {
  key: string;
  mode: Mode;
  source: import("../../utils/matchFilters").MatchSource;
  winner: string;
};

type PlayerSnapshotsByMode = Partial<Record<Mode, PlayerRatingRow>>;
import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { MatchDetails } from "../../components/MatchDetails/MatchDetails";
import { MatchPageLink } from "../../components/MatchPageLink/MatchPageLink";
import { Seo } from "../../components/Seo/Seo";
import { SourceFilterChecks } from "../../components/SourceFilterChecks/SourceFilterChecks";
import { useMatchSearch } from "../../hooks/useMatchSearch";
import { usePersistedState } from "../../hooks/usePersistedState";
import { loadRawMatchesByMode } from "../../lib/matches/matchData";
import {
  ratingsForPlayers,
  sourceKeyFromMatch,
  sourceValueFromMatch,
  summarizeMatchGames,
} from "../../lib/matches/matchSummaries";
import { fetchPlayerRatingsRows } from "../../lib/supabase/supabasePlayerRatings";
import { resolveUsernameInputs } from "../../lib/users/usernameSearch";
import { formatLocalDateTime, formatScore } from "../../utils/formatters";
import { matchupToSlug, parseMatchupSlug } from "../../utils/h2hRoutes";
import { getTimeControlOptions } from "../../utils/matchCollection";
import { isSourceAllowedByFilters, parseDateInputBoundary } from "../../utils/matchFilters";
import { normalizedGamesFromMatch, normalizedPlayersFromMatch } from "../../utils/matchTransforms";
import { readStoredSourceFilters, writeStoredSourceFilters } from "../../utils/sourceFilterStorage";
import { isToggleActionKey } from "../../utils/toggleActionKey";

const normalizeH2HMatches = (
  matches: RawMatchLike[] | null | undefined,
  mode: Mode,
  playerA: string,
  playerB: string,
): H2HMatch[] => {
  const playerALower = playerA.toLowerCase();
  const playerBLower = playerB.toLowerCase();

  return (Array.isArray(matches) ? matches : [])
    .map((match): H2HMatch | null => {
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
        key: `${mode}-${String(match.match_id ?? match.start_ts ?? "")}-${firstGameId}-${resolvedA}-${resolvedB}`,
        matchId: String(match.match_id ?? ""),
        mode,
        startTs: Number(match.start_ts ?? match.s),
        timeControl: String(match.time_control ?? match.t ?? "—"),
        sourceValue: sourceValueFromMatch(match, firstGame),
        source: sourceKeyFromMatch(match, firstGame),
        firstGameId,
        playerA: resolvedA,
        playerB: resolvedB,
        scoreA,
        scoreB,
        winner,
        games: mappedGames,
        ...ratingsForPlayers(match, players, resolvedA, resolvedB),
      };
    })
    .filter((entry): entry is H2HMatch => entry !== null)
    .sort((a, b) => b.startTs - a.startTs);
};

const computeGameScore = (matches: H2HMatch[]): { playerA: number; playerB: number } => {
  return matches.reduce(
    (accumulator, match) => ({
      playerA: accumulator.playerA + Number(match.scoreA || 0),
      playerB: accumulator.playerB + Number(match.scoreB || 0),
    }),
    { playerA: 0, playerB: 0 },
  );
};

const formatScorePair = (leftScore: number, rightScore: number): string =>
  `${formatScore(leftScore)}\u00A0-\u00A0${formatScore(rightScore)}`;

const formatWinnerFirstScore = (match: H2HMatch): string => {
  if (match.winner === match.playerB) return formatScorePair(match.scoreB, match.scoreA);
  return formatScorePair(match.scoreA, match.scoreB);
};

const modeStatLabels = {
  rank: "Rank",
  rating: "Rating",
  rd: "RD",
  peak: "Peak",
};

const h2hSearchStorageKey = "atomic-puzzles:h2h-search";
const h2hModeFiltersStorageKey = "atomic-puzzles:h2h-mode-filters";
const defaultH2HModeFilters: Record<Mode, boolean> = {
  blitz: true,
  bullet: true,
  hyperbullet: true,
  wolfrandom: true,
};

const h2hModeFiltersSchema = z
  .union([z.array(z.string()), z.record(z.string(), z.unknown())])
  .transform((value): Record<Mode, boolean> => {
    if (Array.isArray(value)) {
      return {
        ...defaultH2HModeFilters,
        ...Object.fromEntries(modeOptions.map((mode) => [mode, value.includes(mode)])),
      };
    }

    return {
      ...defaultH2HModeFilters,
      ...Object.fromEntries(
        modeOptions.map((mode) => [
          mode,
          typeof value[mode] === "boolean" ? value[mode] : defaultH2HModeFilters[mode],
        ]),
      ),
    };
  });

const storeLastSearch = (player1: string, player2: string): void => {
  try {
    window.sessionStorage.setItem(h2hSearchStorageKey, JSON.stringify({ player1, player2 }));
  } catch {
    // Session storage is a convenience only; navigation still works without it.
  }
};

const readLastSearch = (): { player1: string; player2: string } | null => {
  try {
    const saved = window.sessionStorage.getItem(h2hSearchStorageKey);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as { player1?: unknown; player2?: unknown };
    return {
      player1: typeof parsed.player1 === "string" ? parsed.player1 : "",
      player2: typeof parsed.player2 === "string" ? parsed.player2 : "",
    };
  } catch {
    return null;
  }
};

const indexRatingsRowsByTimeControl = (rows: PlayerRatingRow[]): PlayerSnapshotsByMode => {
  const snapshots: PlayerSnapshotsByMode = {};

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const timeControl = String(row?.tc ?? "").toLowerCase();
    if (!timeControl || !(modeOptions as readonly string[]).includes(timeControl)) return;
    snapshots[timeControl as Mode] = row;
  });

  return snapshots;
};

export const H2HPage = () => {
  const navigate = useNavigate();
  const { matchup } = useParams({ strict: false });
  const [player1Input, setPlayer1Input] = useState("");
  const [player2Input, setPlayer2Input] = useState("");
  const [modeFilters, setModeFilters] = usePersistedState(
    h2hModeFiltersStorageKey,
    h2hModeFiltersSchema,
    defaultH2HModeFilters,
  );
  const [filters, setFilters] = useState<{
    startDate: string;
    endDate: string;
    timeControl: string;
    sources: SourceFilters;
  }>({
    startDate: "",
    endDate: "",
    timeControl: "all",
    sources: readStoredSourceFilters(),
  });
  const [loadedPlayer1, setLoadedPlayer1] = useState("");
  const [loadedPlayer2, setLoadedPlayer2] = useState("");
  const [playerSnapshots, setPlayerSnapshots] = useState<Record<string, PlayerSnapshotsByMode>>({});
  const [matches, setMatches] = useState<H2HMatch[]>([]);
  const [expandedMatchKeys, setExpandedMatchKeys] = useState<string[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const { error, loading, reset: resetSearch, run: runMatchSearch, setError } = useMatchSearch();

  const startDateTs = useMemo(() => parseDateInputBoundary(filters.startDate, "start"), [filters]);
  const endDateTs = useMemo(() => parseDateInputBoundary(filters.endDate, "end"), [filters]);
  const visibleModeOptions = useMemo(() => {
    const firstSnapshots = playerSnapshots[loadedPlayer1.toLowerCase()] ?? {};
    const secondSnapshots = playerSnapshots[loadedPlayer2.toLowerCase()] ?? {};
    const hasWolfrandomGames =
      Number(firstSnapshots.wolfrandom?.games ?? 0) > 0 ||
      Number(secondSnapshots.wolfrandom?.games ?? 0) > 0;

    return modeOptions.filter((mode) => mode !== "wolfrandom" || hasWolfrandomGames);
  }, [loadedPlayer1, loadedPlayer2, playerSnapshots]);

  const filteredMatches = useMemo(
    () =>
      matches.filter((match) => {
        if (!visibleModeOptions.includes(match.mode)) return false;
        if (match.startTs < startDateTs || match.startTs > endDateTs) return false;
        if (!modeFilters[match.mode]) return false;
        if (filters.timeControl !== "all" && match.timeControl !== filters.timeControl)
          return false;

        return isSourceAllowedByFilters(match.source, filters.sources);
      }),
    [endDateTs, filters, matches, modeFilters, startDateTs, visibleModeOptions],
  );

  const { initialOptions, incrementOptions } = useMemo(
    () => getTimeControlOptions(matches),
    [matches],
  );
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
        visibleModeOptions.map((mode) => [
          mode,
          computeGameScore(filteredMatches.filter((match) => match.mode === mode)),
        ]),
      ),
    [filteredMatches, visibleModeOptions],
  );
  const combinedScore = useMemo(
    () => ({
      playerA: visibleModeOptions.reduce(
        (sum, mode) => sum + (scoresByMode[mode]?.playerA ?? 0),
        0,
      ),
      playerB: visibleModeOptions.reduce(
        (sum, mode) => sum + (scoresByMode[mode]?.playerB ?? 0),
        0,
      ),
    }),
    [scoresByMode, visibleModeOptions],
  );

  const performSearch = useCallback(
    async (first: string, second: string): Promise<void> => {
      if (!first || !second) {
        resetSearch();
        setError("Enter both usernames to search head-to-head.");
        setHasSearched(true);
        setMatches([]);
        return;
      }

      setHasSearched(true);
      setExpandedMatchKeys([]);
      const result = await runMatchSearch(
        async () => {
          const [resolvedFirst = "", resolvedSecond = ""] = await resolveUsernameInputs([
            first,
            second,
          ]);
          const loadModeMatches = (mode: Mode) =>
            loadRawMatchesByMode(mode, {
              filters: { usernamePair: [resolvedFirst, resolvedSecond] },
            });
          const [modeResults, firstRatings, secondRatings] = await Promise.all([
            Promise.all(modeOptions.map(loadModeMatches)),
            fetchPlayerRatingsRows({ username: resolvedFirst }),
            fetchPlayerRatingsRows({ username: resolvedSecond }),
          ]);
          const merged = modeResults
            .flatMap((rawMatches, index) => {
              const mode = modeOptions[index];
              return mode
                ? normalizeH2HMatches(rawMatches, mode, resolvedFirst, resolvedSecond)
                : [];
            })
            .sort((a, b) => b.startTs - a.startTs);
          return { firstRatings, merged, resolvedFirst, resolvedSecond, secondRatings };
        },
        () => setMatches([]),
      );
      if (!result) return;
      const { firstRatings, merged, resolvedFirst, resolvedSecond, secondRatings } = result;
      setLoadedPlayer1(resolvedFirst);
      setLoadedPlayer2(resolvedSecond);
      setMatches(merged);
      setPlayerSnapshots({
        [resolvedFirst.toLowerCase()]: indexRatingsRowsByTimeControl(firstRatings),
        [resolvedSecond.toLowerCase()]: indexRatingsRowsByTimeControl(secondRatings),
      });
      if (!merged.length) setError("No head-to-head matches found for the selected players.");
    },
    [resetSearch, runMatchSearch, setError],
  );

  const handleSearch = async () => {
    if (loading) return;
    const first = player1Input.trim();
    const second = player2Input.trim();
    if (!first || !second) {
      await performSearch(first, second);
      return;
    }

    await runMatchSearch(async () => {
      const [resolvedFirst, resolvedSecond] = await resolveUsernameInputs([first, second]);
      if (!resolvedFirst || !resolvedSecond) return;

      storeLastSearch(resolvedFirst, resolvedSecond);
      await navigate({
        to: "/h2h/$matchup",
        params: {
          matchup: matchupToSlug(resolvedFirst, resolvedSecond),
        },
      });
    });
  };

  useEffect(() => {
    const parsedMatchup = parseMatchupSlug(matchup);
    if (!parsedMatchup) {
      const savedSearch = readLastSearch();
      setHasSearched(false);
      resetSearch();
      if (savedSearch) {
        setPlayer1Input(savedSearch.player1);
        setPlayer2Input(savedSearch.player2);
      }
      return;
    }

    const { player1, player2 } = parsedMatchup;
    setPlayer1Input(player1);
    setPlayer2Input(player2);
    void performSearch(player1.trim(), player2.trim());
  }, [matchup, performSearch, resetSearch]);

  const handleChangePlayers = () => {
    if (loadedPlayer1 || loadedPlayer2) {
      storeLastSearch(loadedPlayer1, loadedPlayer2);
      setPlayer1Input(loadedPlayer1);
      setPlayer2Input(loadedPlayer2);
    }
    void navigate({ to: "/h2h" });
  };

  const player1Snapshot = playerSnapshots[loadedPlayer1.toLowerCase()] || {};
  const player2Snapshot = playerSnapshots[loadedPlayer2.toLowerCase()] || {};
  const setSourceFilter = (source: keyof SourceFilters, checked: boolean): void => {
    setFilters((current) => {
      const nextSources = { ...current.sources, [source]: checked };
      writeStoredSourceFilters(nextSources);
      return {
        ...current,
        sources: nextSources,
      };
    });
  };
  const setModeFilter = (mode: Mode, checked: boolean): void => {
    setModeFilters((current) => ({ ...current, [mode]: checked }));
  };

  const renderModeStats = (modeData: PlayerRatingRow | Record<string, never>) => (
    <>
      {(["rank", "rating", "rd", "peak"] as const).map((key) => (
        <p key={key} className="h2hModeMeta">
          <span>{modeStatLabels[key]}: </span>
          <strong>
            {(modeData as Record<string, unknown>)[key] !== undefined
              ? String((modeData as Record<string, unknown>)[key])
              : "—"}
          </strong>
        </p>
      ))}
    </>
  );

  const seoPath =
    loadedPlayer1 && loadedPlayer2 ? `/h2h/${matchupToSlug(loadedPlayer1, loadedPlayer2)}` : "/h2h";
  const seoTitle =
    loadedPlayer1 && loadedPlayer2
      ? `${loadedPlayer1} vs ${loadedPlayer2} Head-to-Head`
      : "Player Head-to-Head";
  const seoDescription =
    loadedPlayer1 && loadedPlayer2
      ? `Compare ${loadedPlayer1} and ${loadedPlayer2} across atomic chess matches, scores, and blitz, bullet, and hyperbullet splits.`
      : "Compare two atomic chess players side by side across recent results, total score, and time-control splits.";
  const parsedRouteMatchup = parseMatchupSlug(matchup);
  const isSearchPage = !parsedRouteMatchup;
  return (
    <div className="rankingsPage">
      <Seo title={seoTitle} description={seoDescription} path={seoPath} />
      <div className="panel rankingsPanel h2hPanel">
        {isSearchPage ? (
          <>
            <h1>Compare Player Records</h1>
            <p>
              Search two atomic players to open their head-to-head record, scores, and match
              history.
            </p>

            <form
              className="matchFilterPanel h2hSearchForm"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSearch();
              }}
            >
              <div className="h2hSearchGrid">
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
                  {loading ? "Searching..." : "Search Matchup"}
                </button>
              </div>
            </form>
            {error ? <div className="errorText">{error}</div> : null}
          </>
        ) : (
          <>
            <div className="h2hTitleRow">
              <div>
                <h1>
                  {loadedPlayer1 && loadedPlayer2
                    ? `${loadedPlayer1} vs ${loadedPlayer2}`
                    : "Head-to-Head Record"}
                </h1>
              </div>
              <button
                className="analyzeButton h2hChangePlayersButton"
                type="button"
                onClick={handleChangePlayers}
              >
                Change players
              </button>
            </div>

            {error ? <div className="errorText">{error}</div> : null}

            {loading ? <div className="emptyRankings h2hEmptyState">Loading matchup...</div> : null}

            {hasSearched && loadedPlayer1 && loadedPlayer2 ? (
              <>
                <section className="h2hPlayerPanel">
                  <div className="h2hPlayerPanelTop">
                    <div className="h2hPlayerIdentity h2hPlayerIdentityLeft">
                      <span className="h2hPlayerLabel">Player 1</span>
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
                    <div className="h2hScoreBlock h2hScoreBlockHero" aria-label="Overall score">
                      <span className="h2hModeScoreLabel">Overall</span>
                      <strong className="h2hModeCardScore h2hScoreLine">
                        {formatScorePair(combinedScore.playerA, combinedScore.playerB)}
                      </strong>
                    </div>
                    <div className="h2hPlayerIdentity h2hPlayerIdentityRight">
                      <span className="h2hPlayerLabel">Player 2</span>
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

                  <div className="h2hModeGrid">
                    {visibleModeOptions.map((mode) => (
                      <div key={mode} className="h2hModeCard">
                        <div className="h2hModeCardBody">
                          <div className="h2hModeStatsGroup">
                            {renderModeStats(player1Snapshot[mode] || {})}
                          </div>
                          <div className="h2hScoreBlock h2hModeVersus">
                            <span className="h2hModeScoreLabel">{modeLabels[mode] ?? mode}</span>
                            <strong className="h2hModeCardScore h2hScoreLine">
                              {formatScorePair(
                                scoresByMode[mode]?.playerA ?? 0,
                                scoresByMode[mode]?.playerB ?? 0,
                              )}
                            </strong>
                          </div>
                          <div className="h2hModeStatsGroup h2hModeCardRightStats">
                            {renderModeStats(player2Snapshot[mode] || {})}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <form className="matchFilterPanel h2hFilterPanel">
                  <div className="h2hSectionHeading">
                    <h2>Filter Matchup</h2>
                  </div>

                  <div className="h2hFilterGrid">
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
                      Clock
                      <select
                        id="h2h-time-control-filter"
                        value={filters.timeControl}
                        onChange={(event) =>
                          setFilters((current) => ({
                            ...current,
                            timeControl: event.target.value,
                          }))
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

                  <div className="opponentRatingFilter sourceFilterGroup h2hModeFilterGroup">
                    <span className="statusLabel">Time control</span>
                    <div className="sourceFilterChecks h2hModeFilterChecks">
                      {visibleModeOptions.map((mode) => (
                        <label key={mode} className="sourceFilterCheck h2hModeFilterCheck">
                          <input
                            type="checkbox"
                            checked={modeFilters[mode]}
                            onChange={(event) => setModeFilter(mode, event.target.checked)}
                          />
                          <span>{modeLabels[mode]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <SourceFilterChecks values={filters.sources} onChange={setSourceFilter} />
                </form>

                <div className="h2hSectionHeading h2hBreakdownHeading">
                  <h2>Match Breakdown</h2>
                </div>

                <div className="h2hMatchesTableWrap">
                  <table className="h2hMatchesTable" aria-label="Head-to-head match history">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>TC</th>
                        <th>Winner</th>
                        <th>Score</th>
                        <th aria-label="Open match page" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMatches.map((match) => {
                        const isExpanded = expandedMatchKeys.includes(match.key);
                        const toggleMatch = () =>
                          setExpandedMatchKeys((current) =>
                            current.includes(match.key)
                              ? current.filter((key) => key !== match.key)
                              : [...current, match.key],
                          );

                        return (
                          <Fragment key={match.key}>
                            <tr
                              className={`h2hMatchTableRow${isExpanded ? " expanded" : ""}`}
                              onClick={toggleMatch}
                              onKeyDown={(event) => {
                                if (!isToggleActionKey(event)) return;
                                event.preventDefault();
                                toggleMatch();
                              }}
                              role="button"
                              tabIndex={0}
                              aria-expanded={isExpanded}
                            >
                              <td>
                                <LichessGameLink
                                  gameId={match.firstGameId}
                                  source={match.sourceValue}
                                  className="rankingLink h2hMatchDate"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {formatLocalDateTime(match.startTs)}
                                </LichessGameLink>
                              </td>
                              <td>
                                <span className="h2hMatchTableType">
                                  <strong>{match.timeControl}</strong>
                                </span>
                              </td>
                              <td>
                                {match.winner === "Draw" ? (
                                  <span className="h2hMatchWinner">Draw</span>
                                ) : (
                                  <Link
                                    className="rankingLink h2hMatchWinner h2hMatchWinnerLink"
                                    to="/@/$username"
                                    params={{ username: match.winner }}
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    {match.winner}
                                  </Link>
                                )}
                              </td>
                              <td>
                                <span className="h2hMatchTableScore">
                                  {formatWinnerFirstScore(match)}
                                </span>
                              </td>
                              <td>
                                <MatchPageLink
                                  match={match}
                                  onClick={(event) => event.stopPropagation()}
                                  title="Open match page in new tab"
                                />
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr className="matchDetailsRow h2hMatchDetailsRow">
                                <td colSpan={5}>
                                  <div className="matchDetailsInner h2hMatchDetails">
                                    <MatchDetails
                                      match={match}
                                      matchKey={match.key}
                                      showRunningScore
                                      stopPropagation={(event) => event.stopPropagation()}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                      {filteredMatches.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="emptyRankings h2hEmptyState">
                            No matches found with the current filters.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};
