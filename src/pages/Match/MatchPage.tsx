import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { loadRawMatchesByMode } from "../../lib/matches/matchData";
import { MatchDetails } from "../../components/MatchDetails/MatchDetails";
import { Seo } from "../../components/Seo/Seo";
import { modeLabels } from "../../constants/matches";
import { formatLocalDateTime, formatScore } from "../../utils/formatters";
import { normalizedGamesFromMatch, normalizedPlayersFromMatch } from "../../utils/matchTransforms";
import {
  ratingsForPlayers,
  sourceValueFromMatch,
  summarizeMatchGames,
} from "../../lib/matches/matchSummaries";
import { matchupToSlug } from "../../utils/h2hRoutes";
import { normalizeMatchMode } from "../../utils/matchRoutes";
import type { RawMatchLike } from "../../types/matchRaw";
import type { MatchCardData } from "../../types/matchCard";
import "./MatchPage.css";

const decodeParam = (value: unknown): string => {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
};

const normalizeStandaloneMatch = (
  match: RawMatchLike,
  mode: import("../../constants/matches").Mode | "",
): MatchCardData => {
  const rawPlayers = normalizedPlayersFromMatch(match);
  const players =
    rawPlayers.length > 0
      ? rawPlayers.slice(0, 2).map((player) => String(player || "Unknown"))
      : ["Unknown", "Unknown"];
  const playerA = players[0] ?? "Unknown";
  const playerB = players[1] ?? "Unknown";
  const games = normalizedGamesFromMatch(match, players);
  const { scoreA, scoreB, playerAWins, playerBWins, draws, mappedGames } = summarizeMatchGames(
    games,
    playerA,
    playerB,
  );
  const ratings = ratingsForPlayers(match, players, playerA, playerB);
  const firstGame = games[0];
  return {
    matchId: String(match.match_id ?? ""),
    mode,
    startTs: Number(match.start_ts ?? match.s),
    timeControl: String(match.time_control ?? match.t ?? "—"),
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
  const [match, setMatch] = useState<MatchCardData | null>(null);
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
    return `View the full ${(match.mode && modeLabels[match.mode]) || match.mode} atomic chess match between ${match.playerA} and ${match.playerB}.`;
  }, [match]);

  return (
    <>
      <Seo title={title} description={description} />
      <div className="rankingsPage">
        <div className="panel matchPagePanel">
          {loading ? <div className="emptyRankings">Loading match...</div> : null}
          {!loading && error ? <div className="errorText">{error}</div> : null}
          {!loading && !error && match ? (
            <>
              <section className="matchPageHeader" aria-label="Match result">
                <p className="matchPageHeaderLabel">{(match.mode && modeLabels[match.mode]) || match.mode} match</p>
                <div className="matchPageHeaderRow">
                  <Link
                    className="matchPageHeaderPlayer"
                    to="/@/$username"
                    params={{ username: match.playerA }}
                    title={match.playerA}
                  >
                    {match.playerA}
                  </Link>
                  <div className="matchPageHeaderScore" aria-label={`Score ${match.scoreA} to ${match.scoreB}`}>
                    <strong>{formatScore(match.scoreA)}</strong>
                    <span>-</span>
                    <strong>{formatScore(match.scoreB)}</strong>
                  </div>
                  <Link
                    className="matchPageHeaderPlayer matchPageHeaderPlayerRight"
                    to="/@/$username"
                    params={{ username: match.playerB }}
                    title={match.playerB}
                  >
                    {match.playerB}
                  </Link>
                </div>
                <div className="matchPageHeaderMeta">
                  <span className="matchMetaPill">{formatLocalDateTime(match.startTs)}</span>
                  <span className="matchMetaPill">{match.timeControl}</span>
                  <span className="matchMetaPill">{match.sourceValue}</span>
                </div>
                <div className="matchPageHeaderActions">
                  <Link
                    className="matchPageH2HLink"
                    to="/h2h/$matchup"
                    params={{ matchup: matchupToSlug(match.playerA, match.playerB) }}
                  >
                    View H2H
                  </Link>
                </div>
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
      </div>
    </>
  );
};
