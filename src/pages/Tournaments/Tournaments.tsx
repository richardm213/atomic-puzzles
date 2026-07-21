import "./Tournaments.css";

import { faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import {
  getTournamentBracket,
  getTournamentChampion,
  tournamentCatalog,
  type TournamentMeta,
} from "../../lib/matches/tournaments";
import { appAssetPath } from "../../utils/appAssetPath";
import { normalizeUsername } from "../../utils/playerNames";

const tournamentSeriesName = (tournament: TournamentMeta): string => {
  if (tournament.id.startsWith("ahc")) return "Atomic Hyper Championship";
  if (tournament.id.startsWith("ccac")) return "Chess.com Atomic Championship";
  return "World Championship";
};

const tournamentCardTitle = (tournament: TournamentMeta): string =>
  tournament.id.startsWith("awc") ? String(tournament.year) : tournamentSeriesName(tournament);

const TournamentArchiveCard = ({
  tournament,
  champion,
  spotlight = false,
}: {
  tournament: TournamentMeta;
  champion: string;
  spotlight?: boolean;
}) => {
  const showWinner = Boolean(champion) && tournament.id !== "awc2025";

  return (
    <article className={`tournamentCard${spotlight ? " isSpotlight" : ""}`}>
      <div className="tournamentCardArt" aria-hidden="true">
        {tournament.trophyAssetPath ? (
          <img
            src={appAssetPath(tournament.trophyAssetPath)}
            alt=""
            width="112"
            height="112"
            loading={spotlight ? "eager" : "lazy"}
            decoding="async"
          />
        ) : null}
      </div>

      <div className="tournamentCardCopy">
        <h3>{tournamentCardTitle(tournament)}</h3>
        {showWinner ? (
          <div className="tournamentCardChampion hasWinner">
            <span>Champion</span>
            <Link
              className="tournamentCardWinnerLink"
              to="/@/$username"
              params={{ username: normalizeUsername(champion) }}
            >
              {champion}
            </Link>
          </div>
        ) : null}
      </div>

      <Link
        className="primaryActionButton tournamentCardLink"
        to="/tournaments/$tournamentId"
        params={{ tournamentId: tournament.id }}
      >
        <span>Open bracket</span>
        <FontAwesomeIcon icon={faArrowRight} aria-hidden="true" />
      </Link>
    </article>
  );
};

export const TournamentsPage = () => {
  const [championsById, setChampionsById] = useState<Record<string, string>>({});
  const publishedTournaments = tournamentCatalog.filter(
    (tournament) => tournament.status === "available",
  );
  const latestYear = Math.max(...publishedTournaments.map((tournament) => tournament.year));
  const earliestYear = Math.min(...publishedTournaments.map((tournament) => tournament.year));
  const spotlightTournaments = publishedTournaments.filter(
    (tournament) => tournament.year === latestYear,
  );
  const archiveTournaments = publishedTournaments.filter(
    (tournament) => tournament.year !== latestYear,
  );

  useEffect(() => {
    let isCancelled = false;

    const loadChampions = async () => {
      const availableTournaments = tournamentCatalog.filter(
        (tournament) => tournament.status === "available",
      );

      const championEntries = await Promise.all(
        availableTournaments.map(async (tournament) => {
          try {
            const bracket = await getTournamentBracket(tournament.id);
            return [tournament.id, getTournamentChampion(bracket)];
          } catch {
            return [tournament.id, ""];
          }
        }),
      );

      if (isCancelled) return;
      setChampionsById(Object.fromEntries(championEntries.filter(([, champion]) => champion)));
    };

    void loadChampions();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <div className="tournamentsPage">
      <Seo
        title="Tournament history"
        description="Browse atomic tournament brackets and archives."
        path="/tournaments"
      />

      <section className="tournamentsHero">
        <div className="tournamentsHeroCopy">
          <span className="tournamentsEyebrow">Tournament history</span>
          <h1>Championship brackets</h1>
        </div>
        <div className="tournamentsHeroStats" aria-label="Archive summary">
          <div>
            <strong>{publishedTournaments.length}</strong>
            <span>Published brackets</span>
          </div>
          <div>
            <strong>
              {earliestYear}–{latestYear}
            </strong>
            <span>Championship seasons</span>
          </div>
        </div>
      </section>

      <section className="tournamentArchiveSection" aria-labelledby="current-tournaments-heading">
        <div className="tournamentArchiveHeading">
          <span>Current season</span>
          <h2 id="current-tournaments-heading">{latestYear} tournaments</h2>
        </div>
        <div className="tournamentsSpotlightGrid">
          {spotlightTournaments.map((tournament) => (
            <TournamentArchiveCard
              key={tournament.id}
              tournament={tournament}
              champion={championsById[tournament.id] || ""}
              spotlight
            />
          ))}
        </div>
      </section>

      <section className="tournamentArchiveSection" aria-labelledby="past-tournaments-heading">
        <div className="tournamentArchiveHeading">
          <span>Past editions</span>
          <h2 id="past-tournaments-heading">World championship history</h2>
        </div>
        <div className="tournamentsGrid">
          {archiveTournaments.map((tournament) => (
            <TournamentArchiveCard
              key={tournament.id}
              tournament={tournament}
              champion={championsById[tournament.id] || ""}
            />
          ))}
        </div>
      </section>
    </div>
  );
};
