import "./MatchPage.css";
import "./ScheduledMatchPage.css";

import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";

import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import {
  formatMatchKickoff,
  getMatchKickoff,
  hasTournamentMatchResult,
} from "../../lib/matches/matchSchedule";
import { tournamentBracketQueryOptions } from "../../lib/matches/tournamentQueries";
import { getErrorMessage } from "../../utils/errors";
import { formatScore } from "../../utils/formatters";

const MatchCountdown = ({ kickoff, watchPlayer }: { kickoff: number; watchPlayer: string }) => {
  const [now, setNow] = useState(Date.now);
  const remaining = Math.max(0, Math.ceil((kickoff - now) / 1000));
  const isCounting = remaining > 0;

  useEffect(() => {
    if (!isCounting) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isCounting]);

  if (!isCounting) {
    return (
      <section className="scheduledMatchCountdown" aria-label="Watch match">
        <a
          className="matchPageH2HLink scheduledMatchWatchLink"
          href={`https://lichess.org/@/${encodeURIComponent(watchPlayer)}/tv`}
        >
          Watch {watchPlayer} on Lichess TV
        </a>
      </section>
    );
  }

  const days = Math.floor(remaining / 86400);
  const units = [
    ...(days > 0 ? [{ label: "Days", value: days }] : []),
    { label: "Hours", value: Math.floor(remaining / 3600) % 24 },
    { label: "Minutes", value: Math.floor(remaining / 60) % 60 },
    { label: "Seconds", value: remaining % 60 },
  ];

  return (
    <section className="scheduledMatchCountdown" aria-labelledby="match-countdown-heading">
      <h2 id="match-countdown-heading">Match starts in</h2>
      <div className="scheduledMatchTimer" role="timer">
        {units.map(({ label, value }, index) => (
          <Fragment key={label}>
            {index > 0 ? (
              <span className="scheduledMatchTimerSeparator" aria-hidden="true">
                :
              </span>
            ) : null}
            <span className="scheduledMatchTimerUnit">
              <span className="scheduledMatchTimerValue">{String(value).padStart(2, "0")}</span>
              <span className="scheduledMatchTimerLabel">
                {value === 1 ? label.slice(0, -1) : label}
              </span>
            </span>
          </Fragment>
        ))}
      </div>
    </section>
  );
};

export const ScheduledMatchPage = () => {
  const { tournamentId, fixtureId } = useParams({
    from: "/match/scheduled/$tournamentId/$fixtureId",
  });
  const bracketQuery = useQuery(tournamentBracketQueryOptions(tournamentId));
  if (bracketQuery.isPending) return <RouteLoadingFallback />;

  const bracket = bracketQuery.data;
  const fixture = bracket?.byKey.get(fixtureId);
  const kickoff = fixture ? getMatchKickoff(fixture) : null;

  if (fixture?.match_id && !/^https?:\/\//i.test(fixture.match_id)) {
    return <Navigate to="/match/$matchId" params={{ matchId: fixture.match_id }} replace />;
  }

  if (!bracket || !fixture || kickoff === null) {
    return (
      <div className="rankingsPage">
        <div className="panel matchPagePanel">
          <p className="errorText">
            {getErrorMessage(
              bracketQuery.error,
              "This match does not have a published start time.",
            )}
          </p>
          <Link to="/tournaments/$tournamentId" params={{ tournamentId }}>
            Back to bracket
          </Link>
        </div>
      </div>
    );
  }

  const title = `${fixture.p1} vs ${fixture.p2}`;
  const hasResult = hasTournamentMatchResult(fixture);

  return (
    <>
      <Seo
        title={title}
        description={`${bracket.title} · ${fixture.round} · ${formatMatchKickoff(kickoff)}`}
      />
      <div className="rankingsPage">
        <article className="panel matchPagePanel">
          <h1 className="visuallyHidden">{title}</h1>
          <header className="matchPageHeader">
            <div className="matchPageHeaderRow">
              <div className="matchPageHeaderPlayerSummary">
                <PlayerLink
                  className="matchPageHeaderPlayer scheduledMatchPlayer"
                  username={fixture.p1}
                >
                  {fixture.p1}
                </PlayerLink>
              </div>
              <div
                className="matchPageHeaderScore"
                role="group"
                aria-label={`Score ${fixture.s1} to ${fixture.s2}`}
              >
                <strong>{formatScore(fixture.s1)}</strong>
                <span aria-hidden="true">–</span>
                <strong>{formatScore(fixture.s2)}</strong>
              </div>
              <div className="matchPageHeaderPlayerSummary matchPageHeaderPlayerSummaryRight">
                <PlayerLink
                  className="matchPageHeaderPlayer matchPageHeaderPlayerRight scheduledMatchPlayer"
                  username={fixture.p2}
                >
                  {fixture.p2}
                </PlayerLink>
              </div>
            </div>
            <div className="matchPageHeaderMeta">
              <Link
                className="matchPageTournamentLink"
                to="/tournaments/$tournamentId/$tournamentTab"
                params={{ tournamentId, tournamentTab: fixture.bracket }}
              >
                <span className="matchPageTournamentText">
                  {bracket.title} · {fixture.round}
                </span>
              </Link>
              <time className="matchPageMetaPill" dateTime={fixture.scheduled_at}>
                {formatMatchKickoff(kickoff)}
              </time>
            </div>
          </header>
          {hasResult ? (
            fixture.match_id ? (
              <a href={fixture.match_id}>View match games</a>
            ) : null
          ) : (
            <MatchCountdown key={kickoff} kickoff={kickoff} watchPlayer={fixture.p1} />
          )}
        </article>
      </div>
    </>
  );
};
