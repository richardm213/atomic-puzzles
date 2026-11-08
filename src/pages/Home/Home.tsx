import "./Home.css";

import {
  faArrowRight,
  faChartLine,
  faChessBoard,
  faCoins,
  faComments,
  faLayerGroup,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Seo } from "../../components/Seo/Seo";
import {
  tournamentCatalogQueryOptions,
  tournamentChampionsQueryOptions,
} from "../../lib/matches/tournamentQueries";
import { getTournamentRouteId, type TournamentMeta } from "../../lib/matches/tournaments";
import { appAssetPath } from "../../utils/appAssetPath";
import { HomePuzzleArtwork } from "./HomePuzzleArtwork";

const HomeCardContent = ({
  title,
  description,
  artwork,
}: {
  title: string;
  description: string;
  artwork: ReactNode;
}) => (
  <>
    <span className="homeCardArtwork" aria-hidden="true">
      {artwork}
    </span>
    <div className="homeCardCopy">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
    <FontAwesomeIcon className="homeCardArrow" icon={faArrowRight} aria-hidden="true" />
  </>
);

const TournamentSpotlightCard = ({
  tournament,
  champion,
}: {
  tournament: TournamentMeta;
  champion: string;
}) => (
  <Link
    className="homeSpotlightCard homeTrophyShortcut"
    to="/tournaments/$tournamentId"
    params={{ tournamentId: getTournamentRouteId(tournament.id) }}
  >
    <HomeCardContent
      title={tournament.headingTitle || `${tournament.seriesName} ${tournament.year}`}
      description={
        tournament.seriesKey === "awc" && tournament.year === 2026
          ? "Will natso defend his title, or will rechesster, JSF, or max stop him?"
          : champion
            ? `${champion} won the ${tournament.year} ${tournament.seriesName}.`
            : `Follow the seeded field and ${tournament.year} championship bracket.`
      }
      artwork={
        tournament.trophyAssetPath ? (
          <img
            src={appAssetPath(tournament.trophyAssetPath.replace(/\.png$/i, ".webp"))}
            alt=""
            width="140"
            height="140"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <FontAwesomeIcon icon={faChessBoard} />
        )
      }
    />
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
        description="Solve atomic chess puzzles, compare monthly and yearly rankings, search games, and explore player profiles."
        path="/"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Atomic Puzzles",
          url: typeof window === "undefined" ? "/" : window.location.origin,
          description:
            "Solve atomic chess puzzles, compare monthly and yearly rankings, search games, and explore player profiles.",
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

        <HomePuzzleArtwork />
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

          <Link className="homeSpotlightCard homeBettingShortcut" to="/betting">
            <HomeCardContent
              title="AWC 2026 betting"
              description="Bet on the upcoming AWC matches!"
              artwork={<FontAwesomeIcon icon={faCoins} />}
            />
          </Link>

          <Link className="homeSpotlightCard homeYearlyRankingsShortcut" to="/rankings/yearly">
            <HomeCardContent
              title="Yearly rankings"
              description="Compare the strongest average ratings across each calendar year."
              artwork={<FontAwesomeIcon icon={faChartLine} />}
            />
          </Link>

          <Link className="homeSpotlightCard homeArenaShortcut" to="/arenas">
            <HomeCardContent
              title="Arena archive"
              description="Monthly, Shield, and Yearly Atomic arenas. Browse the winners and revisit each event on Lichess."
              artwork={
                <img
                  src={appAssetPath("/images/arenas/atomic-shield.webp")}
                  alt=""
                  width="58"
                  height="64"
                  loading="lazy"
                  decoding="async"
                />
              }
            />
          </Link>

          {featuredTournaments.slice(1).map((tournament) => (
            <TournamentSpotlightCard
              key={tournament.id}
              tournament={tournament}
              champion={champions[tournament.id] || ""}
            />
          ))}

          <Link className="homeSpotlightCard homePuzzleLeaderboardShortcut" to="/rankings/puzzles">
            <HomeCardContent
              title="Puzzle rankings"
              description="Points, correct solves, misses, and total attempts."
              artwork={<FontAwesomeIcon icon={faChessBoard} />}
            />
          </Link>

          <Link className="homeSpotlightCard homeRecentMatchesShortcut" to="/recent">
            <HomeCardContent
              title="Game search"
              description="Find atomic games by player, rating, source, date, and time control."
              artwork={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            />
          </Link>

          <Link className="homeSpotlightCard homeCommentsShortcut" to="/comments">
            <HomeCardContent
              title="Comments from across the site"
              description="Follow conversations on puzzles, player profiles, and match pages in one feed."
              artwork={<FontAwesomeIcon icon={faComments} />}
            />
          </Link>

          <Link className="homeSpotlightCard homePuzzleSetsShortcut" to="/solve/sets">
            <HomeCardContent
              title="Puzzle sets"
              description="Choose a match and play through the puzzles that came from it."
              artwork={<FontAwesomeIcon icon={faLayerGroup} />}
            />
          </Link>
        </div>
      </section>
    </div>
  );
};
