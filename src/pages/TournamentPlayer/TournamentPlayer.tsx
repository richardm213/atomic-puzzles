import "./TournamentPlayer.css";

import {
  faArrowDown,
  faArrowLeft,
  faArrowUp,
  faFireFlameCurved,
  faUser,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { modeLabels } from "../../constants/matches";
import { TournamentFairPlayFlag } from "../../features/tournaments/TournamentFairPlayFlag";
import {
  buildAtomicChessLeaguePlayerAppearances,
  countTournamentPlayerTitles,
  mergeTournamentPlayerAppearances,
} from "../../features/tournaments/tournamentPlayerHistory";
import { getAliasIdentityUsernames } from "../../lib/archive/aliases";
import {
  atomicTourEventEntriesQueryOptions,
  atomicTourPlayerRankingStatsQueryOptions,
  type AtomicTourEventEntry,
} from "../../lib/atomicTour/queries";
import {
  tournamentCatalogQueryOptions,
  tournamentPlayerCountriesQueryOptions,
  tournamentPlayerQueryOptions,
} from "../../lib/matches/tournamentQueries";
import {
  getTournamentRouteId,
  type TournamentPlayerAppearance,
  type TournamentPlayerMatch,
} from "../../lib/matches/tournaments";
import type { WolfarenaTournament } from "../../lib/matches/wolfarena";
import { wolfarenaTournamentQueryOptions } from "../../lib/matches/wolfarenaQueries";
import { profileAliasQueryOptions } from "../../lib/users/aliasQueries";
import { appAssetPath } from "../../utils/appAssetPath";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { formatCalendarDateRange, formatOrdinal, formatTimeControl } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";

const scoreValue = (score: number): string =>
  Number.isInteger(score) ? String(score) : score.toFixed(1).replace(/\.0$/, "");

const formatRankingDate = (date: string): string => date.replaceAll("-", ".");

const resultLabel = (match: TournamentPlayerMatch): string => {
  if (match.result === "unplayed") return "—";
  if (match.result === "win") return "W";
  if (match.result === "loss") return "L";
  return "D";
};

const scoreLabel = (match: TournamentPlayerMatch): string => {
  if (match.result === "unplayed") return "Not played";
  if (match.outcomeType === "disqualification") return "D/Q";
  if (match.outcomeType === "withdrawal") return "W/O";
  return `${scoreValue(match.playerScore)} - ${scoreValue(match.opponentScore)}`;
};

const addWolfarenaPointMultipliers = (
  appearances: TournamentPlayerAppearance[],
  tournament: WolfarenaTournament | undefined,
  usernames: string[],
): TournamentPlayerAppearance[] => {
  if (!tournament) return appearances;
  const playerKeys = new Set(usernames.map(normalizeUsername));
  const roundsByNumber = new Map(tournament.rounds.map((round) => [round.number, round]));

  return appearances.map((appearance) => {
    if (appearance.tournament.id !== tournament.id) return appearance;
    return {
      ...appearance,
      matches: appearance.matches.map((match) => {
        const roundNumber = Number(/^Round (\d+)$/.exec(match.roundLabel)?.[1]);
        const round = roundsByNumber.get(roundNumber);
        const archivedMatch = round?.matches.find(
          (entry) =>
            playerKeys.has(normalizeUsername(entry.player1)) ||
            playerKeys.has(normalizeUsername(entry.player2)),
        );
        if (!archivedMatch) return match;
        const isPlayerOne = playerKeys.has(normalizeUsername(archivedMatch.player1));
        const score = isPlayerOne ? archivedMatch.score1 : archivedMatch.score2;
        const points = isPlayerOne ? archivedMatch.points1 : archivedMatch.points2;
        if (score === null) return match;
        return {
          ...match,
          pointsMultiplier: Math.abs(points - score) > 0.001 ? 2 : 1,
        };
      }),
    };
  });
};

const TournamentTrophy = ({ appearance }: { appearance: TournamentPlayerAppearance }) => {
  const trophyPath = appearance.tournament.trophyAssetPath;
  if (!trophyPath)
    return <span className="tournamentProfileTrophyPlaceholder" aria-hidden="true" />;

  const tournamentName = `${appearance.tournament.seriesName} ${appearance.tournament.year}`;
  return (
    <Link
      className="tournamentProfileTrophy"
      to="/tournaments/$tournamentId"
      params={{ tournamentId: getTournamentRouteId(appearance.tournament.id) }}
      title={tournamentName}
      aria-label={`Open ${tournamentName}`}
    >
      <img src={appAssetPath(trophyPath)} alt="" aria-hidden="true" />
    </Link>
  );
};

const TournamentMatchRow = ({
  match,
  countryCode,
}: {
  match: TournamentPlayerMatch;
  countryCode: string | undefined;
}) => {
  const content = (
    <>
      <span className={`tournamentProfileResult is${match.result}`}>{resultLabel(match)}</span>
      <span className="tournamentProfileRound">
        {match.roundLabel}
        {match.pointsMultiplier === 2 ? (
          <span
            className="tournamentProfilePointRate"
            title="Streak bonus: double points"
            aria-label="Streak bonus: double points"
          >
            <FontAwesomeIcon icon={faFireFlameCurved} aria-hidden="true" />
            2×
          </span>
        ) : null}
      </span>
      <Link
        className="tournamentProfileOpponent"
        to="/tournaments/players/$username"
        params={{ username: normalizeUsername(match.opponent) }}
      >
        <img
          className="tournamentProfileOpponentFlag"
          crossOrigin="anonymous"
          src={countryCodeToFlagUrl(countryCode)}
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
        <span className="tournamentProfileOpponentName">
          {match.opponent}
          {match.opponentSeed ? ` (${match.opponentSeed})` : null}
        </span>
        <TournamentFairPlayFlag playerName={match.opponent} />
      </Link>
      <strong className="tournamentProfileScore">{scoreLabel(match)}</strong>
    </>
  );

  return (
    <div className="tournamentProfileMatchRow">
      {content}
      {match.matchId ? (
        <Link
          className="tournamentProfileMatchLink"
          to="/matches/$matchId"
          params={{ matchId: match.matchId }}
          aria-label={`Open ${match.roundLabel} match against ${match.opponent}`}
        />
      ) : null}
    </div>
  );
};

const TournamentActivityCard = ({
  appearance,
  countryMap,
  tourEntry,
}: {
  appearance: TournamentPlayerAppearance;
  countryMap: Record<string, string>;
  tourEntry?: AtomicTourEventEntry;
}) => {
  const tournamentName = `${appearance.tournament.seriesName} ${appearance.tournament.year}`;
  const showsFinalPlacement = Boolean(appearance.placementFieldLabel);

  return (
    <article className="tournamentProfileEvent">
      <header className="tournamentProfileEventHeader">
        <TournamentTrophy appearance={appearance} />
        <div className="tournamentProfileEventTitle">
          <h2>
            <Link
              to="/tournaments/$tournamentId"
              params={{ tournamentId: getTournamentRouteId(appearance.tournament.id) }}
            >
              {tournamentName}
            </Link>
          </h2>
          {appearance.tournament.startDate ? (
            <span>
              {formatCalendarDateRange(
                appearance.tournament.startDate,
                appearance.tournament.endDate,
              )}
            </span>
          ) : null}
        </div>
        {appearance.divisionLabel || appearance.tournament.timeControl ? (
          <div className="tournamentProfileEventAside">
            <p className="tournamentProfileEventMeta">
              {appearance.divisionLabel ?? (
                <>
                  {appearance.tournament.matchMode
                    ? `${modeLabels[appearance.tournament.matchMode]} `
                    : null}
                  {appearance.tournament.timeControl
                    ? formatTimeControl(appearance.tournament.timeControl)
                    : null}
                </>
              )}
            </p>
          </div>
        ) : null}
      </header>

      {appearance.matches.length ? (
        <div className="tournamentProfileMatches" aria-label={`${tournamentName} matches`}>
          <div className="tournamentProfileMatchHead" aria-hidden="true">
            <span>Result</span>
            <span>Round</span>
            <span>Opponent</span>
            <span>Score</span>
          </div>
          {appearance.matches.map((match) => (
            <TournamentMatchRow
              key={match.key}
              match={match}
              countryCode={countryMap[normalizeUsername(match.opponent)]}
            />
          ))}
        </div>
      ) : (
        <p className="tournamentProfileNoMatches">No individual board results are available.</p>
      )}

      {showsFinalPlacement || tourEntry ? (
        <footer
          className="tournamentProfileTourFooter"
          aria-label="Tournament result and Atomic Tour details"
        >
          {tourEntry ? (
            <dl>
              <div>
                <dt>Points</dt>
                <dd>{tourEntry.pointsEarned.toLocaleString("en-US")}</dd>
              </div>
              <div>
                <dt>Ranking</dt>
                <dd>{tourEntry.startRank ? `#${tourEntry.startRank}` : "–"}</dd>
              </div>
            </dl>
          ) : null}
          {showsFinalPlacement ? (
            <p
              className="tournamentProfilePlacement"
              aria-label={`Final placement: ${appearance.placementLabel} of ${appearance.placementFieldLabel}`}
            >
              <strong>{appearance.placementLabel}</strong>
              <span>of {appearance.placementFieldLabel}</span>
            </p>
          ) : null}
        </footer>
      ) : null}
    </article>
  );
};

export const TournamentPlayerPage = ({ username }: { username?: string }) => {
  const normalizedUsername = normalizeUsername(username);
  const aliasQuery = useQuery({
    ...profileAliasQueryOptions(normalizedUsername),
    enabled: Boolean(normalizedUsername),
  });
  const canonicalUsername = aliasQuery.data?.username ?? normalizedUsername;
  const identityUsernames = useMemo(
    () => getAliasIdentityUsernames(canonicalUsername, aliasQuery.data),
    [aliasQuery.data, canonicalUsername],
  );
  const catalogQuery = useQuery(tournamentCatalogQueryOptions());
  const countryQuery = useQuery(tournamentPlayerCountriesQueryOptions());
  const historyQuery = useQuery({
    ...tournamentPlayerQueryOptions(identityUsernames),
    enabled: !aliasQuery.isPending && identityUsernames.length > 0,
  });
  const tourEntriesQuery = useQuery(atomicTourEventEntriesQueryOptions(identityUsernames));
  const tourRankingStatsQuery = useQuery(
    atomicTourPlayerRankingStatsQueryOptions(identityUsernames),
  );
  const wolfarenaQuery = useQuery(wolfarenaTournamentQueryOptions("wr-arena2026"));
  const appearances = useMemo(() => {
    const merged = mergeTournamentPlayerAppearances(
      historyQuery.data ?? [],
      buildAtomicChessLeaguePlayerAppearances(catalogQuery.data ?? [], identityUsernames),
    );
    const withWolfarenaPoints = addWolfarenaPointMultipliers(
      merged,
      wolfarenaQuery.data,
      identityUsernames,
    );
    const finalStandings = wolfarenaQuery.data?.rounds.at(-1)?.standings ?? [];
    const finalStanding = finalStandings.find((standing) =>
      identityUsernames.includes(normalizeUsername(standing.player)),
    );
    if (!finalStanding) return withWolfarenaPoints;
    return withWolfarenaPoints.map((appearance) =>
      appearance.tournament.id === "wr-arena2026"
        ? {
            ...appearance,
            placementLabel: formatOrdinal(finalStanding.rank),
            placementFieldLabel: `${finalStandings.length} ${finalStandings.length === 1 ? "player" : "players"}`,
          }
        : appearance,
    );
  }, [catalogQuery.data, historyQuery.data, identityUsernames, wolfarenaQuery.data]);

  if (
    aliasQuery.isPending ||
    catalogQuery.isPending ||
    countryQuery.isPending ||
    historyQuery.isPending ||
    tourRankingStatsQuery.isPending
  ) {
    return <RouteLoadingFallback />;
  }

  const totalWins = appearances.reduce((sum, appearance) => sum + appearance.wins, 0);
  const totalLosses = appearances.reduce((sum, appearance) => sum + appearance.losses, 0);
  const totalDraws = appearances.reduce((sum, appearance) => sum + appearance.draws, 0);
  const { titles, teamTitles } = countTournamentPlayerTitles(appearances);
  const showTitleStats = titles > 0 || teamTitles > 0;
  const tourEntriesByTournament = Object.fromEntries(
    (tourEntriesQuery.data ?? []).map((entry) => [entry.tournamentId, entry]),
  );
  const fullRecord = `${totalWins} - ${totalLosses}${totalDraws ? ` - ${totalDraws}` : ""}`;

  return (
    <main className="sitePage tournamentProfilePage">
      <Seo
        title={`${canonicalUsername} tournament history`}
        description={`Tournament history and results for ${canonicalUsername}.`}
        path={`/tournaments/players/${canonicalUsername}`}
      />

      <div className="tournamentProfilePanel">
        <Link className="tournamentProfileBack" to="/tournaments">
          <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
          Tournaments
        </Link>

        <header className="tournamentProfileHeader">
          <div className="tournamentProfileTitleRow">
            <h1>
              {canonicalUsername}
              <TournamentFairPlayFlag playerName={canonicalUsername} />
            </h1>
            <Link
              className="tournamentProfileFullProfile"
              to="/@/$username"
              params={{ username: canonicalUsername }}
              aria-label="Open full profile"
              title="Open full profile"
            >
              <FontAwesomeIcon icon={faUser} aria-hidden="true" />
              Full profile
            </Link>
          </div>
          <div className="tournamentProfileHeaderMeta">
            {tourRankingStatsQuery.data ? (
              <dl className="tournamentProfileSummary tournamentProfileRankSummary">
                <div className="tournamentProfileRankAndMove">
                  <dt className="tournamentProfileRankLabel">Tour rank</dt>
                  <dd className="tournamentProfileRankValue">
                    <Link className="tournamentProfileTourRankLink" to="/rankings/tour">
                      {tourRankingStatsQuery.data.currentRank
                        ? `#${tourRankingStatsQuery.data.currentRank}`
                        : "—"}
                    </Link>
                  </dd>
                  <dt className="tournamentProfileMoveLabel">Move</dt>
                  <dd
                    className={`tournamentProfileMoveValue${
                      tourRankingStatsQuery.data.currentRankChange === null
                        ? ""
                        : tourRankingStatsQuery.data.currentRankChange > 0
                          ? " isUp"
                          : tourRankingStatsQuery.data.currentRankChange < 0
                            ? " isDown"
                            : ""
                    }`}
                  >
                    {tourRankingStatsQuery.data.currentRank === null ? (
                      "—"
                    ) : tourRankingStatsQuery.data.currentRankChange === null ? (
                      "New"
                    ) : tourRankingStatsQuery.data.currentRankChange === 0 ? (
                      "—"
                    ) : (
                      <>
                        <FontAwesomeIcon
                          icon={
                            tourRankingStatsQuery.data.currentRankChange > 0
                              ? faArrowUp
                              : faArrowDown
                          }
                          aria-hidden="true"
                        />
                        {Math.abs(tourRankingStatsQuery.data.currentRankChange)}
                      </>
                    )}
                  </dd>
                </div>
                <div className="tournamentProfileTourRank">
                  <dt>
                    Career high
                    <time dateTime={tourRankingStatsQuery.data.peakRankDate}>
                      ({formatRankingDate(tourRankingStatsQuery.data.peakRankDate)})
                    </time>
                  </dt>
                  <dd>
                    <Link className="tournamentProfileTourRankLink" to="/rankings/tour">
                      #{tourRankingStatsQuery.data.peakRank}
                    </Link>
                  </dd>
                </div>
              </dl>
            ) : null}
            <dl
              className={`tournamentProfileSummary tournamentProfileRecordSummary${showTitleStats ? " hasTitleStats" : ""}`}
            >
              <div>
                <dt>{appearances.length === 1 ? "Tournament" : "Tournaments"}</dt>
                <dd>{appearances.length}</dd>
              </div>
              <div>
                <dt>Match record</dt>
                <dd>{fullRecord}</dd>
              </div>
              {showTitleStats ? (
                <>
                  <div>
                    <dt>{titles === 1 ? "Title" : "Titles"}</dt>
                    <dd>{titles}</dd>
                  </div>
                  <div>
                    <dt>{teamTitles === 1 ? "Team title" : "Team titles"}</dt>
                    <dd>{teamTitles}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          </div>
        </header>

        {appearances.length ? (
          <section className="tournamentProfileActivity" aria-label="Tournament activity">
            {appearances.map((appearance) => (
              <TournamentActivityCard
                key={appearance.tournament.id}
                appearance={appearance}
                countryMap={countryQuery.data ?? {}}
                {...(tourEntriesByTournament[appearance.tournament.id]
                  ? { tourEntry: tourEntriesByTournament[appearance.tournament.id] }
                  : {})}
              />
            ))}
          </section>
        ) : (
          <section className="tournamentProfileEmpty">
            <h2>No tournament history</h2>
            <p>This player has no published tournament results.</p>
          </section>
        )}
      </div>
    </main>
  );
};
