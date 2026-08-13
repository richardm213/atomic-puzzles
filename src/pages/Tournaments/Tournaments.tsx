import "./Tournaments.css";

import { useQuery } from "@tanstack/react-query";

import { Seo } from "../../components/Seo/Seo";
import { tournamentChampionsQueryOptions } from "../../lib/matches/tournamentQueries";
import { tournamentCatalog } from "../../lib/matches/tournaments";
import { TournamentArchiveCard } from "./TournamentArchiveCard";

export const TournamentsPage = () => {
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
  const championsQuery = useQuery(tournamentChampionsQueryOptions());
  const championsById: Record<string, string> = championsQuery.data ?? {};

  return (
    <div className="sitePage tournamentsPage">
      <Seo
        title="Tournament history"
        description="Browse atomic tournament brackets and archives."
        path="/tournaments"
      />

      <section className="tournamentsHero">
        <div className="tournamentsHeroCopy">
          <span className="tournamentsEyebrow">Championship history</span>
          <h1>Tournament archive</h1>
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
          <h2 id="current-tournaments-heading">{latestYear} championships</h2>
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
          <h2 id="past-tournaments-heading">Previous championships</h2>
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
