import "./Home.css";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Seo } from "../../components/Seo/Seo";
import {
  tournamentCatalogQueryOptions,
  tournamentChampionsQueryOptions,
} from "../../lib/matches/tournamentQueries";
import { getTournamentRouteId, type TournamentMeta } from "../../lib/matches/tournaments";
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
    params={{ tournamentId: getTournamentRouteId(tournament.id) }}
  >
    <h2>{tournament.headingTitle || `${tournament.seriesName} ${tournament.year}`}</h2>
    <p>
      {tournament.seriesKey === "awc" && tournament.year === 2026
        ? "Will natso defend his title, or will rechesster, JSF, or max stop him?"
        : champion
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
        title="Atomic Puzzles | Atomic Chess Training & Rankings"
        description="Solve atomic chess puzzles, compare monthly and yearly rankings, study recent matches, and explore player profiles."
        path="/"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Atomic Puzzles",
          url: typeof window === "undefined" ? "/" : window.location.origin,
          description:
            "Solve atomic chess puzzles, compare monthly and yearly rankings, study recent matches, and explore player profiles.",
        }}
      />
      <section className="homeHero" aria-labelledby="home-title">
        <div className="homeHeroLead">
          <h1 id="home-title">Atomic chess puzzles, rankings, and matches</h1>

          <p className="homePuzzleCount">
            <strong>2,000+</strong> puzzles available
          </p>

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

        <div className="homePuzzlePreview" aria-hidden="true">
          <div className="homePuzzlePreviewCard homePuzzlePreviewSecondary">
            <img
              className="homePuzzlePreviewDark"
              src={appAssetPath("/images/home-puzzles/home-puzzle-dark-3.png")}
              alt=""
              width="918"
              height="1036"
              decoding="async"
            />
            <img
              className="homePuzzlePreviewLight"
              src={appAssetPath("/images/home-puzzles/home-puzzle-light-3.png")}
              alt=""
              width="918"
              height="1036"
              decoding="async"
            />
          </div>
          <div className="homePuzzlePreviewCard homePuzzlePreviewPrimary">
            <img
              className="homePuzzlePreviewDark"
              src={appAssetPath("/images/home-puzzles/home-puzzle-dark-1.png")}
              alt=""
              width="918"
              height="1036"
              decoding="async"
            />
            <img
              className="homePuzzlePreviewLight"
              src={appAssetPath("/images/home-puzzles/home-puzzle-light-1.png")}
              alt=""
              width="918"
              height="1036"
              decoding="async"
            />
          </div>
        </div>
      </section>

      <section className="homeSpotlightSection" aria-label="Atomic chess shortcuts">
        <div className="homeSpotlightGrid">
          {featuredTournaments.slice(0, 1).map((tournament) => (
            <TournamentSpotlightCard
              key={tournament.id}
              tournament={tournament}
              champion={champions[tournament.id] || ""}
            />
          ))}

          <Link
            className="homeSpotlightCard homeH2HShortcut"
            to="/matches/$matchId"
            params={{ matchId: "Yr9V8s5R" }}
          >
            <h2>2018 AWC grand final reset</h2>
            <p>onubense vs tipau</p>
          </Link>

          <Link className="homeSpotlightCard homeYearlyRankingsShortcut" to="/rankings/yearly">
            <h2>Yearly rankings</h2>
            <p>Compare the strongest average ratings across each calendar year.</p>
          </Link>

          <Link className="homeSpotlightCard homeArenaShortcut" to="/arenas">
            <h2>Arena archive</h2>
            <div className="homeArenaArtwork" aria-hidden="true">
              <img
                src={appAssetPath("/images/arenas/atomic-shield.png")}
                alt=""
                width="58"
                height="64"
                loading="lazy"
                decoding="async"
              />
            </div>
            <p>
              Monthly, Shield, and Yearly Atomic arenas. Browse the winners and revisit each event
              on Lichess.
            </p>
          </Link>

          {featuredTournaments.slice(1).map((tournament) => (
            <TournamentSpotlightCard
              key={tournament.id}
              tournament={tournament}
              champion={champions[tournament.id] || ""}
            />
          ))}

          <Link className="homeSpotlightCard homePuzzleLeaderboardShortcut" to="/rankings/puzzles">
            <h2>Puzzle rankings</h2>
            <p>Points, correct solves, misses, and total attempts.</p>
          </Link>

          <Link className="homeSpotlightCard homeRecentMatchesShortcut" to="/recent">
            <h2>Recent matches</h2>
            <p>See who's playing, who won, and how the ratings moved.</p>
          </Link>

          <Link className="homeSpotlightCard homeCommentsShortcut" to="/comments">
            <h2>Comments from across the site</h2>
            <p>Follow conversations on puzzles, player profiles, and match pages in one feed.</p>
          </Link>

          <Link className="homeSpotlightCard homePuzzleSetsShortcut" to="/solve/sets">
            <h2>Puzzle sets</h2>
            <p>Choose a match and play through the puzzles that came from it.</p>
          </Link>
        </div>
      </section>
    </div>
  );
};
