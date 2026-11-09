import {
  faArrowRight,
  faBookOpen,
  faChartLine,
  faChessBoard,
  faCoins,
  faComments,
  faLayerGroup,
  faMagnifyingGlass,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ComponentProps, ComponentType, ReactNode } from "react";

import { HomeAnchor } from "./HomeHeroLead";

export const HomeCardContent = ({
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

export const HomeShortcuts = ({
  group,
  LinkComponent = HomeAnchor,
}: {
  group: "primary" | "secondary";
  LinkComponent?: ComponentType<ComponentProps<"a">>;
}) =>
  group === "primary" ? (
    <>
      <LinkComponent className="homeSpotlightCard" href="/atomic-chess">
        <HomeCardContent
          title="New to atomic chess?"
          description="Learn the rules and strategies."
          artwork={<FontAwesomeIcon icon={faBookOpen} />}
        />
      </LinkComponent>

      <LinkComponent className="homeSpotlightCard homeBettingShortcut" href="/betting">
        <HomeCardContent
          title="AWC 2026 betting"
          description="Bet on the upcoming AWC matches!"
          artwork={<FontAwesomeIcon icon={faCoins} />}
        />
      </LinkComponent>

      <LinkComponent
        className="homeSpotlightCard homeYearlyRankingsShortcut"
        href="/rankings/yearly"
      >
        <HomeCardContent
          title="Yearly rankings"
          description="Compare the strongest average ratings across each calendar year."
          artwork={<FontAwesomeIcon icon={faChartLine} />}
        />
      </LinkComponent>

      <LinkComponent className="homeSpotlightCard homeArenaShortcut" href="/arenas">
        <HomeCardContent
          title="Arena archive"
          description="Monthly, Shield, and Yearly Atomic arenas. Browse the winners and revisit each event on Lichess."
          artwork={
            <img
              src="/images/arenas/atomic-shield.webp"
              alt=""
              width="58"
              height="64"
              loading="lazy"
              decoding="async"
            />
          }
        />
      </LinkComponent>
    </>
  ) : (
    <>
      <LinkComponent
        className="homeSpotlightCard homePuzzleLeaderboardShortcut"
        href="/rankings/puzzles"
      >
        <HomeCardContent
          title="Puzzle rankings"
          description="Points, correct solves, misses, and total attempts."
          artwork={<FontAwesomeIcon icon={faChessBoard} />}
        />
      </LinkComponent>

      <LinkComponent className="homeSpotlightCard homeRecentMatchesShortcut" href="/recent">
        <HomeCardContent
          title="Game search"
          description="Find atomic games by player, rating, source, date, and time control."
          artwork={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        />
      </LinkComponent>

      <LinkComponent className="homeSpotlightCard homeCommentsShortcut" href="/comments">
        <HomeCardContent
          title="Comments from across the site"
          description="Follow conversations on puzzles, player profiles, and match pages in one feed."
          artwork={<FontAwesomeIcon icon={faComments} />}
        />
      </LinkComponent>

      <LinkComponent className="homeSpotlightCard homePuzzleSetsShortcut" href="/solve/sets">
        <HomeCardContent
          title="Puzzle sets"
          description="Choose a match and play through the puzzles that came from it."
          artwork={<FontAwesomeIcon icon={faLayerGroup} />}
        />
      </LinkComponent>
    </>
  );
