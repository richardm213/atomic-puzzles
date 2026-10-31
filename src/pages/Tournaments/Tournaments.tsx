import "./Tournaments.css";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import {
  tournamentCatalogQueryOptions,
  tournamentChampionsQueryOptions,
} from "../../lib/matches/tournamentQueries";
import { compareTournamentStartDates } from "../../lib/matches/tournaments";
import { normalizeUsername } from "../../utils/playerNames";
import { TournamentArchiveCard } from "./TournamentArchiveCard";

export const TournamentsPage = () => {
  const navigate = useNavigate();
  const [playerQuery, setPlayerQuery] = useState("");
  const [navigationPending, setNavigationPending] = useState(false);
  const catalogQuery = useQuery(tournamentCatalogQueryOptions());
  const championsQuery = useQuery(tournamentChampionsQueryOptions());
  if (catalogQuery.isPending) return <RouteLoadingFallback />;

  const publishedTournaments = (catalogQuery.data ?? [])
    .filter((tournament) => tournament.status === "available")
    .sort(compareTournamentStartDates);
  if (!publishedTournaments.length) {
    return (
      <div className="sitePage tournamentsPage">
        <h1>Tournament archive unavailable</h1>
        <p>Please try again shortly.</p>
      </div>
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
  const normalizedPlayerQuery = normalizeUsername(playerQuery);

  const openPlayerHistory = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!normalizedPlayerQuery || navigationPending) return;

    setNavigationPending(true);
    void navigate({
      to: "/tournaments/players/$username",
      params: { username: normalizedPlayerQuery },
    }).finally(() => setNavigationPending(false));
  };

  return (
    <div className="sitePage tournamentsPage">
      <Seo
        title="Tournament history"
        description="Browse atomic tournament brackets and archives."
        path="/tournaments"
      />

      <div className="panel tournamentsPanel">
        <header className="tournamentsHeader">
          <h1>Tournament archive</h1>
          <form className="tournamentPlayerSearch" onSubmit={openPlayerHistory}>
            <label>
              <span className="visuallyHidden">Player username</span>
              <input
                type="search"
                value={playerQuery}
                placeholder="Player username"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck="false"
                disabled={navigationPending}
                onChange={(event) => setPlayerQuery(event.target.value)}
              />
            </label>
            <button type="submit" disabled={!normalizedPlayerQuery || navigationPending}>
              {navigationPending ? "Opening…" : "View history"}
            </button>
          </form>
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
    </div>
  );
};
