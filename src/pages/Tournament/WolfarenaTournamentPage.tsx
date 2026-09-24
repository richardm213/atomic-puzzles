import "./WolfarenaTournamentPage.css";

import {
  faArrowLeft,
  faArrowRight,
  faArrowUpRightFromSquare,
  faComment,
  faFireFlameCurved,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { CommunityDiscussion } from "../../components/PuzzleCommunity/PuzzleCommunity";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { tournamentCatalogQueryOptions } from "../../lib/matches/tournamentQueries";
import { getAdjacentTournamentMetas } from "../../lib/matches/tournaments";
import {
  formatWolfarenaPoints,
  type WolfarenaMatch,
  wolfarenaRoundSourceUrl,
  type WolfarenaTournament,
} from "../../lib/matches/wolfarena";
import { wolfarenaTournamentQueryOptions } from "../../lib/matches/wolfarenaQueries";
import { appAssetPath } from "../../utils/appAssetPath";
import { normalizeUsername } from "../../utils/playerNames";

const STORAGE_KEY = "tournament-view:wr-arena2026:round";

const formatDate = (date: string): string =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`),
  );

const matchStatusLabel = (status: WolfarenaMatch["status"]): string => {
  if (status === "partial-forfeit") return "Partial forfeit";
  if (status === "double-forfeit") return "Double forfeit";
  if (status === "forfeit") return "Forfeit";
  return "Played";
};

const initialRoundNumber = (tournament: WolfarenaTournament): number => {
  if (typeof window === "undefined") return tournament.rounds.length;
  const stored = Number(window.sessionStorage.getItem(STORAGE_KEY));
  return tournament.rounds.some((round) => round.number === stored)
    ? stored
    : tournament.rounds.length;
};

const PlayerLink = ({ player }: { player: string }) => (
  <Link to="/@/$username" params={{ username: normalizeUsername(player) }}>
    {player}
  </Link>
);

const MatchContent = ({ match }: { match: WolfarenaMatch }) => {
  if (match.status === "bye") {
    return (
      <>
        <div className="wolfarenaMatchTopline">
          <span className="wolfarenaMatchStatus">Bye</span>
          <span className="wolfarenaMatchPoints">+{formatWolfarenaPoints(match.points1)} pts</span>
        </div>
        <div className="wolfarenaByePlayer">
          <PlayerLink player={match.player1} />
        </div>
      </>
    );
  }

  const player1Won = Number(match.score1) > Number(match.score2);
  const player2Won = Number(match.score2) > Number(match.score1);
  return (
    <>
      <div className="wolfarenaMatchTopline">
        <span className={`wolfarenaMatchStatus is${match.status}`}>
          {matchStatusLabel(match.status)}
        </span>
      </div>
      <div className={`wolfarenaPlayerRow${player1Won ? " isWinner" : ""}`}>
        <PlayerLink player={match.player1} />
        <span className="wolfarenaPlayerPoints">+{formatWolfarenaPoints(match.points1)} pts</span>
        <strong>{match.score1}</strong>
      </div>
      <div className={`wolfarenaPlayerRow${player2Won ? " isWinner" : ""}`}>
        <PlayerLink player={match.player2} />
        <span className="wolfarenaPlayerPoints">+{formatWolfarenaPoints(match.points2)} pts</span>
        <strong>{match.score2}</strong>
      </div>
      {match.additionalMatchIds?.length ? (
        <div className="wolfarenaMatchParts" aria-label="Archived match parts">
          {[match.matchId, ...match.additionalMatchIds].map((matchId, index) => (
            <Link key={matchId} to="/matches/$matchId" params={{ matchId }}>
              Part {index + 1}
            </Link>
          ))}
        </div>
      ) : null}
    </>
  );
};

const MatchCard = ({ match }: { match: WolfarenaMatch }) =>
  match.matchId && !match.additionalMatchIds?.length ? (
    <article className="wolfarenaMatchCard isLinked">
      <MatchContent match={match} />
      <Link
        className="wolfarenaMatchCardOverlayLink"
        to="/matches/$matchId"
        params={{ matchId: match.matchId }}
        aria-label={`Open ${match.player1} against ${match.player2}, ${match.score1} to ${match.score2}`}
      />
    </article>
  ) : (
    <article className={`wolfarenaMatchCard${match.matchId ? " isLinked" : ""}`}>
      <MatchContent match={match} />
    </article>
  );

const WolfarenaTournamentArchive = ({
  tournament: wolfarena2026,
}: {
  tournament: WolfarenaTournament;
}) => {
  const catalogQuery = useQuery(tournamentCatalogQueryOptions());
  const tournamentMeta = (catalogQuery.data ?? []).find(
    (tournament) => tournament.id === wolfarena2026.id,
  );
  const adjacentTournaments = useMemo(
    () => getAdjacentTournamentMetas(wolfarena2026.id, catalogQuery.data ?? []),
    [catalogQuery.data, wolfarena2026.id],
  );
  const [selectedRoundNumber, setSelectedRoundNumber] = useState(() =>
    initialRoundNumber(wolfarena2026),
  );
  const roundButtonsRef = useRef(new Map<number, HTMLButtonElement>());
  const selectedRound =
    wolfarena2026.rounds.find((round) => round.number === selectedRoundNumber) ??
    wolfarena2026.rounds.at(-1)!;
  const selectedRoundIndex = wolfarena2026.rounds.findIndex(
    (round) => round.number === selectedRound.number,
  );

  useEffect(() => {
    window.sessionStorage.setItem(STORAGE_KEY, String(selectedRound.number));
    roundButtonsRef.current.get(selectedRound.number)?.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "center",
    });
  }, [selectedRound.number]);

  const selectRound = (roundNumber: number): void => {
    setSelectedRoundNumber(roundNumber);
  };

  const handleRoundKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = selectedRoundIndex;
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, selectedRoundIndex - 1);
    if (event.key === "ArrowRight") {
      nextIndex = Math.min(wolfarena2026.rounds.length - 1, selectedRoundIndex + 1);
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = wolfarena2026.rounds.length - 1;
    const nextRound = wolfarena2026.rounds[nextIndex];
    if (!nextRound) return;
    selectRound(nextRound.number);
    window.requestAnimationFrame(() => roundButtonsRef.current.get(nextRound.number)?.focus());
  };

  const goToAdjacentRound = (direction: -1 | 1): void => {
    const nextRound = wolfarena2026.rounds[selectedRoundIndex + direction];
    if (nextRound) selectRound(nextRound.number);
  };

  return (
    <div className="tournamentPage wolfarenaPage">
      <Seo
        title={wolfarena2026.title}
        description="Browse every Wolfarena 2026 pairing, result, points award, and post-round standing."
        path={`/tournaments/${wolfarena2026.id}`}
      />

      <section className="tournamentPageHero">
        <div className="tournamentPageHeroCopy wolfarenaHeroCopy">
          <div className="tournamentHeroTopRow">
            <Link className="tournamentBackLink" to="/tournaments">
              All tournaments
            </Link>
            <div className="tournamentYearNav" aria-label="Tournament years">
              {adjacentTournaments.previous ? (
                <Link
                  className="tournamentYearNavLink"
                  to="/tournaments/$tournamentId"
                  params={{ tournamentId: adjacentTournaments.previous.id }}
                >
                  ← {adjacentTournaments.previous.year}
                </Link>
              ) : (
                <span className="tournamentYearNavSpacer" aria-hidden="true" />
              )}
              <span className="tournamentYearNavCurrent" aria-current="page">
                2026
              </span>
              {adjacentTournaments.next ? (
                <Link
                  className="tournamentYearNavLink"
                  to="/tournaments/$tournamentId"
                  params={{ tournamentId: adjacentTournaments.next.id }}
                >
                  {adjacentTournaments.next.year} →
                </Link>
              ) : (
                <span className="tournamentYearNavSpacer" aria-hidden="true" />
              )}
            </div>
          </div>
          <h1>{wolfarena2026.title}</h1>
          <div className="wolfarenaChampionLine">
            <span>Champion</span>
            <PlayerLink player={wolfarena2026.champion} />
            <strong>128.0 pts</strong>
          </div>
        </div>
        {tournamentMeta?.trophyAssetPath ? (
          <img
            className="tournamentPageTrophy"
            src={appAssetPath(tournamentMeta.trophyAssetPath)}
            alt=""
            width="152"
            height="152"
            loading="eager"
            decoding="async"
            aria-hidden="true"
          />
        ) : null}
      </section>

      <nav className="wolfarenaRoundNav" aria-label="Tournament rounds">
        <div className="wolfarenaRoundTrack" role="tablist" aria-label="Select a round">
          {wolfarena2026.rounds.map((round) => (
            <button
              key={round.number}
              ref={(element) => {
                if (element) roundButtonsRef.current.set(round.number, element);
                else roundButtonsRef.current.delete(round.number);
              }}
              type="button"
              role="tab"
              aria-selected={round.number === selectedRound.number}
              aria-controls="wolfarena-round-panel"
              tabIndex={round.number === selectedRound.number ? 0 : -1}
              className={`wolfarenaRoundButton${round.number === selectedRound.number ? " isActive" : ""}`}
              onClick={() => selectRound(round.number)}
              onKeyDown={handleRoundKeyDown}
            >
              <span>Round {round.number}</span>
              <small>{formatDate(round.date)}</small>
            </button>
          ))}
        </div>
      </nav>

      <section
        id="wolfarena-round-panel"
        className="wolfarenaRoundPanel"
        role="tabpanel"
        aria-label={`Round ${selectedRound.number}`}
      >
        <header className="wolfarenaRoundHeader">
          <div>
            <h2>Round {selectedRound.number}</h2>
            <p>
              {formatDate(selectedRound.date)} · {selectedRound.kind} pairing round
            </p>
          </div>
          <div className="wolfarenaRoundActions">
            <a
              href={wolfarenaRoundSourceUrl(wolfarena2026, selectedRound)}
              target="_blank"
              rel="noreferrer"
            >
              Source post
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} aria-hidden="true" />
            </a>
            <a href="#tournament-comments">
              <FontAwesomeIcon icon={faComment} aria-hidden="true" />
              Comments
            </a>
          </div>
        </header>

        <div className="wolfarenaRoundGrid">
          <section className="wolfarenaResults" aria-labelledby="wolfarena-results-heading">
            <div className="wolfarenaSectionHeading">
              <h3 id="wolfarena-results-heading">Results</h3>
              <span>{selectedRound.matches.length} pairings</span>
            </div>
            <div className="wolfarenaMatchList">
              {selectedRound.matches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </section>

          <section className="wolfarenaStandings" aria-labelledby="wolfarena-standings-heading">
            <div className="wolfarenaSectionHeading">
              <h3 id="wolfarena-standings-heading">Standings after round</h3>
              <span>{selectedRound.standings.length} scoring players</span>
            </div>
            <div className="wolfarenaStandingsTableWrap">
              <table className="wolfarenaStandingsTable">
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Player</th>
                    <th scope="col">Points</th>
                    <th scope="col">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRound.standings.map((standing) => (
                    <tr key={standing.player}>
                      <td data-label="Rank">{standing.rank}</td>
                      <th scope="row" data-label="Player">
                        <PlayerLink player={standing.player} />
                        {standing.streak ? (
                          <span
                            className="wolfarenaStreak"
                            aria-label="Streak active: double points"
                            title="Streak active: double points"
                          >
                            <FontAwesomeIcon icon={faFireFlameCurved} aria-hidden="true" />
                            <span>2× points</span>
                          </span>
                        ) : null}
                      </th>
                      <td data-label="Points">
                        <strong>{formatWolfarenaPoints(standing.points)}</strong>
                      </td>
                      <td data-label="Rating">{standing.rating ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <footer className="wolfarenaRoundFooter">
          <button
            type="button"
            disabled={selectedRoundIndex === 0}
            onClick={() => goToAdjacentRound(-1)}
          >
            <FontAwesomeIcon icon={faArrowLeft} aria-hidden="true" />
            Previous round
          </button>
          <span>
            {selectedRound.number} of {wolfarena2026.rounds.length}
          </span>
          <button
            type="button"
            disabled={selectedRoundIndex === wolfarena2026.rounds.length - 1}
            onClick={() => goToAdjacentRound(1)}
          >
            Next round
            <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
          </button>
        </footer>
      </section>

      <div id="tournament-comments" className="tournamentCommentsSection">
        <CommunityDiscussion target={{ type: "tournament", id: wolfarena2026.id }} />
      </div>
    </div>
  );
};

export const WolfarenaTournamentPage = () => {
  const archiveQuery = useQuery(wolfarenaTournamentQueryOptions("wr-arena2026"));

  if (archiveQuery.isPending) return <RouteLoadingFallback />;
  if (archiveQuery.isError || !archiveQuery.data) {
    return (
      <main className="tournamentPage wolfarenaPage">
        <section className="wolfarenaArchiveError" role="alert">
          <h1>Wolfarena 2026</h1>
          <p>The tournament archive could not be loaded. Please try again.</p>
          <button type="button" onClick={() => void archiveQuery.refetch()}>
            Retry
          </button>
        </section>
      </main>
    );
  }

  return <WolfarenaTournamentArchive tournament={archiveQuery.data} />;
};
