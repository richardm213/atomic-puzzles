import "./Home.css";

import { faTrophy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Seo } from "../../components/Seo/Seo";
import {
  tournamentCatalogQueryOptions,
  tournamentChampionsQueryOptions,
} from "../../lib/matches/tournamentQueries";
import type { TournamentMeta } from "../../lib/matches/tournaments";
import { appAssetPath } from "../../utils/appAssetPath";

const TournamentSpotlightCard = ({
  tournament,
  champion,
}: {
  tournament: TournamentMeta;
  champion: string;
}) => (
  <Link
    className="homeSpotlightCard homeTrophyShortcut"
    data-series={tournament.seriesKey}
    to="/tournaments/$tournamentId"
    params={{ tournamentId: tournament.id }}
  >
    <span>Championship</span>
    <h2>{tournament.headingTitle || `${tournament.seriesName} ${tournament.year}`}</h2>
    <p>
      {champion
        ? `${champion} won the ${tournament.year} ${tournament.seriesName}.`
        : `Follow the seeded field and ${tournament.year} championship bracket.`}
    </p>
    {tournament.trophyAssetPath ? (
      <img
        src={appAssetPath(tournament.trophyAssetPath)}
        alt=""
        width="140"
        height="140"
        loading="lazy"
        decoding="async"
      />
    ) : null}
  </Link>
);

export const HomePage = () => {
  const catalogQuery = useQuery(tournamentCatalogQueryOptions());
  const championsQuery = useQuery(tournamentChampionsQueryOptions());
  const champions = championsQuery.data ?? {};
  const featuredTournaments = (catalogQuery.data ?? [])
    .filter(
      (tournament) =>
        tournament.status === "available" && tournament.homeFeatureOrder !== undefined,
    )
    .sort((left, right) => Number(left.homeFeatureOrder) - Number(right.homeFeatureOrder));

  return (
    <div className="homePage">
      <Seo
        title="Puzzles, Rankings & Matches"
        description="Train with atomic chess puzzles, browse monthly and yearly rankings, track recent matches, and look up player profiles in one place."
        path="/"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Atomic Puzzles",
          url: typeof window === "undefined" ? "/" : window.location.origin,
          description:
            "Atomic chess puzzles, rankings, recent matches, and player profiles for the Lichess atomic community.",
        }}
      />
      <section className="homeHero" aria-labelledby="home-title">
        <div className="homeHeroLead">
          <h1 id="home-title">Atomic chess puzzles, rankings, and matches</h1>

          <div className="homeHeroActions">
            <Link className="homePrimaryCta" to="/solve">
              Solve puzzles
            </Link>
            <Link className="homeSecondaryCta" to="/rankings">
              View rankings
            </Link>
            <Link className="homeSecondaryCta" to="/analysis">
              Analyze
            </Link>
          </div>
        </div>
      </section>

      <section className="homeSpotlightSection" aria-label="Atomic chess shortcuts">
        <div className="homeSpotlightGrid">
          {featuredTournaments.slice(0, 2).map((tournament) => (
            <TournamentSpotlightCard
              key={tournament.id}
              tournament={tournament}
              champion={champions[tournament.id] || ""}
            />
          ))}

          <Link className="homeSpotlightCard homeYearlyRankingsShortcut" to="/rankings/yearly">
            <span>Rankings</span>
            <h2>Yearly rankings</h2>
            <p>Compare the strongest average ratings across each calendar year.</p>
          </Link>

          <Link className="homeSpotlightCard homeArenaShortcut" to="/arenas">
            <h2>Arena archive</h2>
            <div className="homeArenaArtwork" aria-hidden="true">
              <FontAwesomeIcon icon={faTrophy} />
            </div>
            <p>
              Monthly, Shield, and Yearly Atomic arenas. Browse the winners and revisit each event
              on Lichess.
            </p>
            <strong>
              Browse arenas <span aria-hidden="true">→</span>
            </strong>
          </Link>

          {featuredTournaments.slice(2).map((tournament) => (
            <TournamentSpotlightCard
              key={tournament.id}
              tournament={tournament}
              champion={champions[tournament.id] || ""}
            />
          ))}

          <Link className="homeSpotlightCard homePuzzleLeaderboardShortcut" to="/solve/leaderboard">
            <span>Puzzles</span>
            <h2>Puzzle leaderboard</h2>
            <p>Points, correct solves, misses, and total attempts.</p>
          </Link>

          <Link
            className="homeSpotlightCard homeH2HShortcut"
            to="/matches/$mode/$matchId"
            params={{ mode: "blitz", matchId: "MPme5e0a" }}
          >
            <span>Blockbuster match</span>
            <h2>maxwellssilvrhammer vs wolfram_ep</h2>
            <p>Top two ranked blitz players collide in a marquee atomic showdown.</p>
          </Link>

          <Link className="homeSpotlightCard homeRecentMatchesShortcut" to="/recent">
            <span>Latest games</span>
            <h2>Recent matches</h2>
            <p>See who's playing, who won, and how the ratings moved.</p>
          </Link>

          <Link className="homeSpotlightCard homeCommentsShortcut" to="/comments">
            <span>Community discussion</span>
            <h2>Comments from across the site</h2>
            <p>Follow conversations on puzzles, player profiles, and match pages in one feed.</p>
          </Link>

          <Link className="homeSpotlightCard homePuzzleSetsShortcut" to="/solve/sets">
            <span>Focused training</span>
            <h2>Puzzle sets</h2>
            <p>Choose a match and play through the puzzles that came from it.</p>
          </Link>
        </div>
      </section>
    </div>
  );
};
