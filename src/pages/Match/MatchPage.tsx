import "./MatchPage.css";

import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useMemo } from "react";

import { BannedPlayerMark } from "../../components/BannedPlayerMark/BannedPlayerMark";
import { MatchDetails } from "../../components/MatchDetails/MatchDetails";
import { CommunityDiscussion } from "../../components/PuzzleCommunity/PuzzleCommunity";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { modeLabels } from "../../constants/matches";
import { toMatchCardData } from "../../lib/matches/data";
import { matchupToSlug } from "../../lib/matches/h2hRoutes";
import { matchDetailQueryOptions } from "../../lib/matches/queries";
import { normalizeMatchMode } from "../../lib/matches/routes";
import { formatLocalDateTime, formatScore } from "../../utils/formatters";

const decodeParam = (value: unknown): string => {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
};

export const MatchPage = () => {
  const { matchId: matchIdParam } = useParams({ strict: false });
  const decodedMatchId = decodeParam(matchIdParam);
  const hasValidMatchKey = Boolean(decodedMatchId);
  const matchQuery = useQuery({
    ...matchDetailQueryOptions(decodedMatchId),
    enabled: hasValidMatchKey,
  });
  const mode = normalizeMatchMode(matchQuery.data?.match?.mode);
  const match = matchQuery.data?.match ? toMatchCardData(matchQuery.data.match, mode) : null;
  const tournamentLocation = matchQuery.data?.tournamentLocation ?? null;
  const loading = hasValidMatchKey && matchQuery.isPending;
  const error = !hasValidMatchKey
    ? "This match link is missing a valid match id."
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
                    <BannedPlayerMark username={match.playerA} />
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
                    <BannedPlayerMark username={match.playerB} />
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
              />
            </>
          ) : null}
        </div>
      </div>
    </>
  );
};
