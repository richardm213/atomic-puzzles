import "./Home.css";

import { faChessBoard } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import { HOME_DESCRIPTION, HOME_STRUCTURED_DATA, HOME_TITLE } from "../../../shared/seo";
import { Seo } from "../../components/Seo/Seo";
import {
  tournamentCatalogQueryOptions,
  tournamentChampionsQueryOptions,
} from "../../lib/matches/tournamentQueries";
import { getTournamentRouteId, type TournamentMeta } from "../../lib/matches/tournaments";
import { appAssetPath } from "../../utils/appAssetPath";
import { HomeHeroLead } from "./HomeHeroLead";
import { HomePuzzleArtwork } from "./HomePuzzleArtwork";
import { HomeCardContent, HomeShortcuts } from "./HomeShortcuts";

const HomeNavigationLink = ({ href, className, children }: ComponentProps<"a">) => (
  <Link to={href ?? "/"} className={className ?? ""}>
    {children}
  </Link>
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
        title={HOME_TITLE}
        description={HOME_DESCRIPTION}
        path="/"
        structuredData={HOME_STRUCTURED_DATA}
      />
      <section className="homeHero" aria-labelledby="home-title">
        <HomeHeroLead LinkComponent={HomeNavigationLink} />

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

          <HomeShortcuts group="primary" LinkComponent={HomeNavigationLink} />

          {featuredTournaments.slice(1).map((tournament) => (
            <TournamentSpotlightCard
              key={tournament.id}
              tournament={tournament}
              champion={champions[tournament.id] || ""}
            />
          ))}

          <HomeShortcuts group="secondary" LinkComponent={HomeNavigationLink} />
        </div>
      </section>
    </div>
  );
};
