import "./MatchPage.css";

import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useMemo } from "react";

import { MatchDetails } from "../../components/MatchDetails/MatchDetails";
import { CommunityDiscussion } from "../../components/PuzzleCommunity/PuzzleCommunity";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { modeLabels } from "../../constants/matches";
import { matchDetailQueryOptions } from "../../lib/matches/matchQueries";
import {
  ratingsForPlayers,
  sourceValueFromMatch,
  summarizeMatchGames,
} from "../../lib/matches/matchSummaries";
import type { MatchCardData } from "../../types/matchCard";
import type { RawMatchLike } from "../../types/matchRaw";
import { formatLocalDateTime, formatScore } from "../../utils/formatters";
import { matchupToSlug } from "../../utils/h2hRoutes";
import { normalizeMatchMode } from "../../utils/matchRoutes";
import { normalizedGamesFromMatch, normalizedPlayersFromMatch } from "../../utils/matchTransforms";

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
  const hasValidMatchKey = Boolean(mode && decodedMatchId);
  const matchQuery = useQuery({
    ...matchDetailQueryOptions(mode, decodedMatchId),
    enabled: hasValidMatchKey,
  });
  const match = matchQuery.data?.match
    ? normalizeStandaloneMatch(matchQuery.data.match, mode)
    : null;
  const tournamentLocation = matchQuery.data?.tournamentLocation ?? null;
  const loading = hasValidMatchKey && matchQuery.isPending;
  const error = !hasValidMatchKey
    ? "This match link is missing a valid mode or match id."
    : matchQuery.error instanceof Error
      ? matchQuery.error.message
      : matchQuery.error
        ? String(matchQuery.error)
        : "";

  const title = useMemo(() => {
    if (!match) return "Match";
    return `${match.playerA} vs ${match.playerB}`;
  }, [match]);

  const description = useMemo(() => {
    if (!match) return "View a full atomic chess match breakdown.";
    return `View the full ${(match.mode && modeLabels[match.mode]) || match.mode} atomic chess match between ${match.playerA} and ${match.playerB}.`;
  }, [match]);

  if (loading && !match) return <RouteLoadingFallback />;

  return (
    <>
      <Seo title={title} description={description} />
      <div className="rankingsPage">
        <div className="panel matchPagePanel">
          {!loading && error ? <div className="errorText">{error}</div> : null}
          {!loading && !error && match ? (
            <>
              <section className="matchPageHeader" aria-label="Match result">
                <p className="matchPageHeaderLabel">
                  {(match.mode && modeLabels[match.mode]) || match.mode} match
                </p>
                <div className="matchPageHeaderRow">
                  <Link
                    className="matchPageHeaderPlayer"
                    to="/@/$username"
                    params={{ username: match.playerA }}
                    title={match.playerA}
                  >
                    {match.playerA}
                  </Link>
                  <div
                    className="matchPageHeaderScore"
                    aria-label={`Score ${match.scoreA} to ${match.scoreB}`}
                  >
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
                  {tournamentLocation ? (
                    <Link
                      className="matchPageTournamentLink"
                      to="/tournaments/$tournamentId"
                      params={{ tournamentId: tournamentLocation.tournament.id }}
                      title={`Open ${tournamentLocation.tournament.title}`}
                    >
                      <span className="matchPageTournamentText">
                        {tournamentLocation.tournament.title} {tournamentLocation.roundLabel}
                      </span>
                    </Link>
                  ) : null}
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

              <CommunityDiscussion
                target={{
                  type: "match",
                  id: match.matchId || decodedMatchId,
                  context: mode,
                }}
                heading="Match discussion"
              />
            </>
          ) : null}
        </div>
      </div>
    </>
  );
};
