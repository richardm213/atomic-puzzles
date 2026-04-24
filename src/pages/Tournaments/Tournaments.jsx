import { Link } from "@tanstack/react-router";
import { Seo } from "../../components/Seo/Seo";
import { tournamentCatalog } from "../../lib/tournaments";
import "./Tournaments.css";

export const TournamentsPage = () => (
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
