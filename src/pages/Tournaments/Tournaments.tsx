import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Seo } from "../../components/Seo/Seo";
import { getTournamentBracket, getTournamentChampion, tournamentCatalog } from "../../lib/matches/tournaments";
import { normalizeUsername } from "../../utils/playerNames";
import "./Tournaments.css";

export const TournamentsPage = () => {
  const [championsById, setChampionsById] = useState<Record<string, string>>({});

  useEffect(() => {
    let isCancelled = false;

    const loadChampions = async () => {
      const availableTournaments = tournamentCatalog.filter((tournament) => tournament.status === "available");

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

    loadChampions();

    return () => {
      isCancelled = true;
    };
  }, []);

  return (
    <div className="tournamentsPage">
      <Seo
        title="Atomic World Championship Tournaments"
        description="Browse Atomic World Championship tournament brackets and archives."
        path="/tournaments"
      />

      <section className="tournamentsHero">
        <span className="tournamentsEyebrow">Tournaments</span>
        <h1>Atomic World Championship brackets</h1>
      </section>

      <section className="tournamentsGrid" aria-label="Tournament archive">
        {tournamentCatalog.map((tournament) => {
          const isAvailable = tournament.status === "available";
          const champion = championsById[tournament.id];
          const showWinner = Boolean(champion) && tournament.id !== "awc2025";

          return (
            <article
              key={tournament.id}
              className={`tournamentCard ${isAvailable ? "isAvailable" : "isLocked"}`}
            >
              <div className="tournamentCardHeader">
                <span className={`tournamentCardStatus ${isAvailable ? "live" : "soon"}`}>
                  {isAvailable ? "Available now" : "Coming soon"}
                </span>
              </div>

              <h2>{tournament.title}</h2>
              <p
                className={`tournamentCardWinner${showWinner ? "" : " tournamentCardWinnerPlaceholder"}`}
                aria-hidden={showWinner ? undefined : true}
              >
                {showWinner ? (
                  <>
                    Winner:{" "}
                    <Link
                      className="tournamentCardWinnerLink"
                      to="/@/$username"
                      params={{ username: normalizeUsername(champion) }}
                    >
                      {champion}
                    </Link>
                  </>
                ) : (
                  "\u00A0"
                )}
              </p>

              {isAvailable ? (
                <Link className="tournamentCardLink" to="/tournaments/$tournamentId" params={{ tournamentId: tournament.id }}>
                  Open bracket
                </Link>
              ) : (
                <span className="tournamentCardDisabled">Archive pending</span>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
};
