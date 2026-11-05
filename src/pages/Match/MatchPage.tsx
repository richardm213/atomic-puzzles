import "./MatchPage.css";

import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";

import { BannedPlayerMark } from "../../components/BannedPlayerMark/BannedPlayerMark";
import { GameAnalysisBatchControl } from "../../components/GameAnalysisBatchControl/GameAnalysisBatchControl";
import { MatchDetails } from "../../components/MatchDetails/MatchDetails";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { CommunityDiscussion } from "../../components/PuzzleCommunity/PuzzleCommunity";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { modeLabels } from "../../constants/matches";
import { toMatchCardData } from "../../lib/matches/data";
import { matchupToSlug } from "../../lib/matches/h2hRoutes";
import { matchDetailQueryOptions } from "../../lib/matches/queries";
import { decodeRouteParam, normalizeMatchMode } from "../../lib/matches/routes";
import { getTournamentRouteId } from "../../lib/matches/tournaments";
import { getErrorMessage } from "../../utils/errors";
import { formatLocalDateTime, formatScore } from "../../utils/formatters";

export const MatchPage = () => {
  const { matchId: matchIdParam } = useParams({ strict: false });
  const decodedMatchId = decodeRouteParam(matchIdParam);
  const hasValidMatchKey = Boolean(decodedMatchId);
  const matchQuery = useQuery({
    ...matchDetailQueryOptions(decodedMatchId),
    enabled: hasValidMatchKey,
  });
  const mode = normalizeMatchMode(matchQuery.data?.match?.mode);
  const match = matchQuery.data?.match ? toMatchCardData(matchQuery.data.match, mode) : null;
  const modeLabel = match ? (match.mode && modeLabels[match.mode]) || match.mode : "";
  const tournamentLocation = matchQuery.data?.tournamentLocation ?? null;
  const loading = hasValidMatchKey && matchQuery.isPending;
  const error = !hasValidMatchKey
    ? "This match link is missing a valid match id."
    : matchQuery.error
      ? getErrorMessage(matchQuery.error, "Unable to load this match.")
      : "";

  const title = match ? `${match.playerA} vs ${match.playerB}` : "Match";
  const description = match
    ? `View the full ${modeLabel ? `${modeLabel} ` : ""}atomic chess match between ${match.playerA} and ${match.playerB}.`
    : "View a full atomic chess match breakdown.";

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
                <div className="matchPageHeaderRow">
                  <PlayerLink
                    className="matchPageHeaderPlayer"
                    username={match.playerA}
                    title={match.playerA}
                  >
                    {match.playerA}
                    <BannedPlayerMark username={match.playerA} />
                  </PlayerLink>
                  <div
                    className="matchPageHeaderScore"
                    aria-label={`Score ${match.scoreA} to ${match.scoreB}`}
                  >
                    <strong>{formatScore(match.scoreA)}</strong>
                    <span>-</span>
                    <strong>{formatScore(match.scoreB)}</strong>
                  </div>
                  <PlayerLink
                    className="matchPageHeaderPlayer matchPageHeaderPlayerRight"
                    username={match.playerB}
                    title={match.playerB}
                  >
                    {match.playerB}
                    <BannedPlayerMark username={match.playerB} />
                  </PlayerLink>
                </div>
                <div className="matchPageHeaderMeta">
                  {modeLabel ? <span className="matchPageMetaPill">{modeLabel}</span> : null}
                  <span className="matchPageMetaPill">{formatLocalDateTime(match.startTs)}</span>
                  <span className="matchPageMetaPill timeControlValue">{match.timeControl}</span>
                  <span className="matchPageMetaPill">{match.sourceValue}</span>
                </div>
                <div className="matchPageHeaderActions">
                  {tournamentLocation ? (
                    <Link
                      className="matchPageTournamentLink"
                      to="/tournaments/$tournamentId"
                      params={{
                        tournamentId: getTournamentRouteId(tournamentLocation.tournament.id),
                      }}
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
                    <GameAnalysisBatchControl
                      games={match.games
                        .filter((game) => game.id && game.id !== "—")
                        .map((game) => ({ id: game.id, number: game.index + 1 }))}
                      triggerLabel="Analyze match"
                      allowGameSelection
                      className="matchPageAnalyzeControl"
                    />
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
              />
            </>
          ) : null}
        </div>
      </div>
    </>
  );
};
