import "./Tournaments.css";

import { useQuery } from "@tanstack/react-query";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import {
  tournamentCatalogQueryOptions,
  tournamentChampionsQueryOptions,
} from "../../lib/matches/tournamentQueries";
import { compareTournamentStartDates } from "../../lib/matches/tournaments";
import { TournamentArchiveCard } from "./TournamentArchiveCard";

export const TournamentsPage = () => {
  const catalogQuery = useQuery(tournamentCatalogQueryOptions());
  const championsQuery = useQuery(tournamentChampionsQueryOptions());
  if (catalogQuery.isPending) return <RouteLoadingFallback />;

  const publishedTournaments = (catalogQuery.data ?? [])
    .filter((tournament) => tournament.status === "available")
    .sort(compareTournamentStartDates);
  if (!publishedTournaments.length) {
    return (
      <main className="sitePage tournamentsPage">
        <h1>Tournament archive unavailable</h1>
        <p>Please try again shortly.</p>
      </main>
    );
  }
  const latestYear = Math.max(...publishedTournaments.map((tournament) => tournament.year));
  const spotlightTournaments = publishedTournaments.filter(
    (tournament) => tournament.year === latestYear,
  );
  const archiveTournaments = publishedTournaments.filter(
    (tournament) => tournament.year !== latestYear,
  );
  const championsById: Record<string, string> = championsQuery.data ?? {};

  return (
    <main className="sitePage tournamentsPage">
      <Seo
        title="Tournament history"
        description="Browse atomic tournament brackets and archives."
        path="/tournaments"
      />

      <div className="panel tournamentsPanel">
        <header className="tournamentsHeader">
          <h1>Tournament archive</h1>
        </header>

        <section className="tournamentArchiveSection" aria-labelledby="current-tournaments-heading">
          <div className="tournamentArchiveHeading">
            <h2 id="current-tournaments-heading">Recent</h2>
            <span>Champion</span>
          </div>
          <div className="tournamentsGrid">
            {spotlightTournaments.map((tournament) => (
              <TournamentArchiveCard
                key={tournament.id}
                tournament={tournament}
                champion={championsById[tournament.id] || ""}
              />
            ))}
          </div>
        </section>

        <section className="tournamentArchiveSection" aria-labelledby="past-tournaments-heading">
          <div className="tournamentArchiveHeading">
            <h2 id="past-tournaments-heading">AWC history</h2>
            <span>Champion</span>
          </div>
          <div className="tournamentsGrid">
            {archiveTournaments.map((tournament) => (
              <TournamentArchiveCard
                key={tournament.id}
                tournament={tournament}
                champion={tournament.id === "awc2025" ? "" : championsById[tournament.id] || ""}
              />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
};
