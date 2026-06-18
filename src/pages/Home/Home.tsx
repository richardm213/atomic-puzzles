import "./Home.css";

import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import { useAppSettings } from "../../context/AppSettings";
import { resolveUsernameInputs } from "../../lib/users/usernameSearch";
import { appAssetPath } from "../../utils/appAssetPath";
import { matchupToSlug } from "../../utils/h2hRoutes";

const featureLinks = [
  {
    to: "/recent",
    eyebrow: "Scout",
    title: "Recent matches",
    body: "Scores, ratings, dates, and sources.",
  },
  {
    to: "/solve/sets",
    eyebrow: "Train",
    title: "Puzzle sets",
    body: "Curated runs for focused training.",
  },
  {
    to: "/users",
    eyebrow: "Browse",
    title: "Player index",
    body: "Tracked players, ratings, and aliases.",
  },
];

const featuredH2HMatchup = matchupToSlug("maxwellssilvrhammer", "rechesster");
const lastYearRankingsPath = "/rankings?year=2025&month=Jun&mode=blitz";

const darkModePuzzleCollageImages = [
  {
    src: "/images/home-puzzles/home-puzzle-dark-1.png",
    alt: "Atomic chess puzzle position with black to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-dark-2.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-dark-3.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-dark-4.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-dark-5.png",
    alt: "Atomic chess puzzle position with black to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-dark-6.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-dark-7.png",
    alt: "Atomic chess puzzle position with white to move",
  },
];

const lightModePuzzleCollageImages = [
  {
    src: "/images/home-puzzles/home-puzzle-light-1.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-light-2.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-light-3.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-light-4.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-light-5.png",
    alt: "Atomic chess puzzle position with black to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-light-6.png",
    alt: "Atomic chess puzzle position with black to move",
  },
  {
    src: "/images/home-puzzles/home-puzzle-light-7.png",
    alt: "Atomic chess puzzle position with white to move",
  },
];

export const HomePage = () => {
  const { theme } = useAppSettings();
  const [comparePlayerOneQuery, setComparePlayerOneQuery] = useState("");
  const [comparePlayerTwoQuery, setComparePlayerTwoQuery] = useState("");
  const navigate = useNavigate();
  const trimmedComparePlayerOneQuery = comparePlayerOneQuery.trim();
  const trimmedComparePlayerTwoQuery = comparePlayerTwoQuery.trim();
  const puzzleCollageImages =
    theme === "light" ? lightModePuzzleCollageImages : darkModePuzzleCollageImages;

  const handleCompareSearch = async (
    event: import("react").FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    if (!trimmedComparePlayerOneQuery || !trimmedComparePlayerTwoQuery) return;

    const [resolvedPlayerOne, resolvedPlayerTwo] = await resolveUsernameInputs([
      trimmedComparePlayerOneQuery,
      trimmedComparePlayerTwoQuery,
    ]);
    if (!resolvedPlayerOne || !resolvedPlayerTwo) return;

    void navigate({
      to: "/h2h/$matchup",
      params: {
        matchup: matchupToSlug(resolvedPlayerOne, resolvedPlayerTwo),
      },
    });
  };

  return (
    <div className="homePage">
      <Seo
        title="Atomic Chess Puzzles, Rankings, and Match Tracker"
        description="Train with atomic chess puzzles, browse monthly rankings, track recent matches, and look up player profiles in one place."
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
          <div className="homeKicker">
            <img src={appAssetPath("/favicon.ico")} alt="" width="24" height="24" />
            Atomic puzzles
          </div>
          <h1 id="home-title">The best place to train and follow atomic chess</h1>
          <p className="homeIntro">
            Atomic puzzles, rankings, match history, and player pages for the Lichess atomic scene.
          </p>

          <div className="homeHeroActions">
            <Link className="homePrimaryCta" to="/solve">
              Solve puzzles
            </Link>
            <Link className="homeSecondaryCta" to="/rankings">
              View rankings
            </Link>
          </div>
        </div>

        <div
          className="homeImageStage"
          aria-label="Slideshow of atomic puzzle positions"
          role="img"
        >
          {puzzleCollageImages.map((image, index) => (
            <picture
              key={image.src}
              className="homePuzzleCard"
              style={{ "--slide-delay": `${index * 7}s` } as import("react").CSSProperties}
              aria-hidden="true"
            >
              <img
                src={appAssetPath(image.src)}
                alt=""
                width="870"
                height="990"
                decoding="async"
                fetchPriority={index === 0 ? "high" : "low"}
                loading={index === 0 ? "eager" : "lazy"}
              />
            </picture>
          ))}
        </div>

        <div className="homeHeroForms">
          <form className="homeCompareSearch" onSubmit={handleCompareSearch}>
            <label htmlFor="home-compare-player-one">Compare two players</label>
            <div className="homeCompareGrid">
              <input
                id="home-compare-player-one"
                type="text"
                value={comparePlayerOneQuery}
                placeholder="player one"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setComparePlayerOneQuery(event.target.value)}
              />
              <input
                id="home-compare-player-two"
                type="text"
                value={comparePlayerTwoQuery}
                placeholder="player two"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => setComparePlayerTwoQuery(event.target.value)}
              />
              <button
                type="submit"
                disabled={!trimmedComparePlayerOneQuery || !trimmedComparePlayerTwoQuery}
              >
                View H2H
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="homeSpotlightSection" aria-label="Atomic chess shortcuts">
        <div className="homeSpotlightGrid">
          <Link className="homeSpotlightCard" to="/solve/leaderboard">
            <span>Puzzles</span>
            <h2>Puzzle leaderboard</h2>
            <p>Points, correct solves, misses, and total attempts.</p>
          </Link>

          <Link
            className="homeSpotlightCard homeTournamentShortcut"
            to="/tournaments/$tournamentId"
            params={{ tournamentId: "awc2025" }}
          >
            <span>Tournament</span>
            <h2>AWC 2025</h2>
            <p>Bracket and match paths from last year's championship.</p>
            <img
              src={appAssetPath("/images/awc-trophies/atomicwc25.png")}
              alt=""
              width="140"
              height="140"
              loading="lazy"
              decoding="async"
            />
          </Link>

          <a className="homeSpotlightCard" href={lastYearRankingsPath}>
            <span>This time last year</span>
            <h2>June 2025 blitz</h2>
            <p>Revisit the top of the table one year ago.</p>
          </a>

          <Link
            className="homeSpotlightCard homeH2HShortcut"
            to="/h2h/$matchup"
            params={{ matchup: featuredH2HMatchup }}
          >
            <span>Featured H2H</span>
            <h2>maxwellssilvrhammer vs rechesster</h2>
            <p>Max won the yearly, just edging out rechesster. Check out the games.</p>
          </Link>
        </div>
      </section>

      <section className="homeQuickLinksSection" aria-label="More atomic chess tools">
        <div className="homeQuickLinksHeader">
          <span className="homeSectionLabel">More</span>
          <h2>Database tools</h2>
        </div>
        <div className="homeFeatureGrid" aria-label="Primary tools">
          {featureLinks.map((feature) => (
            <Link key={feature.to} className="homeFeatureCard" to={feature.to}>
              <span>{feature.eyebrow}</span>
              <h2>{feature.title}</h2>
              <p>{feature.body}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};
