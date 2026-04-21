import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { loadRawMatchesByMode } from "../../lib/matchData";
import { MatchDetails } from "../../components/MatchDetails/MatchDetails";
import { Seo } from "../../components/Seo/Seo";
import { modeLabels } from "../../constants/matches";
import { formatLocalDateTime, formatScore } from "../../utils/formatters";
import { normalizedGamesFromMatch, normalizedPlayersFromMatch } from "../../utils/matchTransforms";
import { ratingsForPlayers, sourceValueFromMatch, summarizeMatchGames } from "../../lib/matchSummaries";
import { normalizeMatchMode } from "../../utils/matchRoutes";
import "./MatchPage.css";

const decodeParam = (value) => {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
};

const normalizeStandaloneMatch = (match, mode) => {
  const rawPlayers = normalizedPlayersFromMatch(match);
  const players =
    rawPlayers.length > 0
      ? rawPlayers.slice(0, 2).map((player) => String(player || "Unknown"))
      : ["Unknown", "Unknown"];
  const [playerA, playerB] = players.length >= 2 ? players : [players[0], "Unknown"];
  const games = normalizedGamesFromMatch(match, players);
  const { scoreA, scoreB, playerAWins, playerBWins, draws, mappedGames } = summarizeMatchGames(
    games,
    playerA,
    playerB,
  );
  const ratings = ratingsForPlayers(match, players, playerA, playerB);
  const firstGame = games[0];

  return {
    matchId: String(match?.match_id || ""),
    mode,
    startTs: Number(match?.start_ts ?? match?.s),
    timeControl: String(match?.time_control ?? match?.t ?? "—"),
    playerA,
    playerB,
    scoreA,
    scoreB,
    playerAWins,
    playerBWins,
    draws,
    ...ratings,
    gameCount: games.length,
    firstGameId: String(firstGame?.id || "—"),
    games: mappedGames,
    sourceValue: sourceValueFromMatch(match, firstGame),
  };
};

export const MatchPage = () => {
  const { mode: modeParam, matchId: matchIdParam } = useParams({ strict: false });
  const mode = normalizeMatchMode(modeParam);
  const decodedMatchId = decodeParam(matchIdParam);
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadMatch = async () => {
      if (!mode || !decodedMatchId) {
        setMatch(null);
        setError("This match link is missing a valid mode or match id.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        const matches = await loadRawMatchesByMode(mode, { filters: { matchId: decodedMatchId } });
        if (cancelled) return;

        const resolvedMatch = Array.isArray(matches) ? matches[0] : null;
        if (!resolvedMatch) {
          setMatch(null);
          setError("Match not found.");
          return;
        }

        setMatch(normalizeStandaloneMatch(resolvedMatch, mode));
      } catch (loadError) {
        if (cancelled) return;
        setMatch(null);
        setError(String(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadMatch();

    return () => {
      cancelled = true;
    };
  }, [decodedMatchId, mode]);

  const title = useMemo(() => {
    if (!match) return "Match | Atomic Puzzles";
    return `${match.playerA} vs ${match.playerB} | Atomic Puzzles`;
  }, [match]);

  const description = useMemo(() => {
    if (!match) return "View a full atomic chess match breakdown.";
    return `View the full ${modeLabels[match.mode] || match.mode} atomic chess match between ${match.playerA} and ${match.playerB}.`;
  }, [match]);

  return (
    <>
      <Seo title={title} description={description} />
      <div className="panel matchPagePanel">
        {loading ? <div className="emptyRankings">Loading match...</div> : null}
        {!loading && error ? <div className="errorText">{error}</div> : null}
        {!loading && !error && match ? (
          <>
            <section className="matchPageHero">
              <div className="matchPageHeroCopy">
                <p className="matchPageEyebrow">{modeLabels[match.mode] || match.mode} match</p>
                <h1 className="matchPageTitle">
                  <Link className="matchPlayerLink" to="/@/$username" params={{ username: match.playerA }}>
                    {match.playerA}
                  </Link>
                  <span className="matchPageVersus">vs</span>
                  <Link className="matchPlayerLink" to="/@/$username" params={{ username: match.playerB }}>
                    {match.playerB}
                  </Link>
                </h1>
                <div className="matchPageMeta">
                  <span className="matchMetaPill">{formatLocalDateTime(match.startTs)}</span>
                  <span className="matchMetaPill">{match.timeControl}</span>
                  <span className="matchMetaPill">{match.sourceValue}</span>
                </div>
              </div>

              <div className="matchPageScoreCard" aria-label={`Score ${match.scoreA} to ${match.scoreB}`}>
                <div className="matchPageScore">
                  <div className="matchPageScoreSide">
                    <span className="matchPageScoreName">{match.playerA}</span>
                    <strong>{formatScore(match.scoreA)}</strong>
                  </div>
                  <span className="matchPageScoreDivider">-</span>
                  <div className="matchPageScoreSide">
                    <span className="matchPageScoreName">{match.playerB}</span>
                    <strong>{formatScore(match.scoreB)}</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className="matchPageSummaryGrid" aria-label="Match summary">
              <article className="matchPageSummaryCard">
                <span>Games</span>
                <strong>{match.gameCount}</strong>
              </article>
              <article className="matchPageSummaryCard">
                <span className="matchPageSummaryLabel" title={`${match.playerA} wins`}>
                  {match.playerA} wins
                </span>
                <strong>{formatScore(match.playerAWins)}</strong>
              </article>
              <article className="matchPageSummaryCard">
                <span className="matchPageSummaryLabel" title={`${match.playerB} wins`}>
                  {match.playerB} wins
                </span>
                <strong>{formatScore(match.playerBWins)}</strong>
              </article>
              <article className="matchPageSummaryCard matchPageSummaryCardCompact">
                <span>Draws</span>
                <strong>{formatScore(match.draws)}</strong>
              </article>
            </section>

            <section className="matchPageContent">
              <div className="matchPageDetailsCard">
                <div className="matchPageSectionHeading">
                  <h2>Game Breakdown</h2>
                </div>
                <MatchDetails
                  match={match}
                  matchKey={`standalone-${match.matchId || match.firstGameId}`}
                  showRunningScore
                />
              </div>
            </section>
          </>
        ) : null}
      </div>
    </>
  );
};
