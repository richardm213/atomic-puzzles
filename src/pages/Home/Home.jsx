import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAppSettings } from "../../context/AppSettings";
import { resolveUsernameInput } from "../../lib/searchUsernames";
import { appAssetPath } from "../../utils/appAssetPath";
import { normalizeUsername } from "../../utils/playerNames";
import { Seo } from "../../components/Seo/Seo";
import "./Home.css";

const featureLinks = [
  {
    to: "/solve",
    eyebrow: "Train",
    title: "Atomic puzzles",
    body: "Solve forcing positions, play the full line, and stay sharp for real games.",
  },
  {
    to: "/rankings",
    eyebrow: "Measure",
    title: "Monthly rankings",
    body: "View blitz and bullet separately, with known alts merged into one profile.",
  },
  {
    to: "/recent",
    eyebrow: "Scout",
    title: "Recent matches",
    body: "View results with score, ratings, source, and date in one place.",
  },
  {
    to: "/h2h",
    eyebrow: "Compare",
    title: "Head-to-head",
    body: "Compare two players side by side across both pools.",
  },
];

const darkModePuzzleCollageImages = [
  {
    src: "/home-puzzle-dark-1.png",
    alt: "Atomic chess puzzle position with black to move",
  },
  {
    src: "/home-puzzle-dark-2.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-dark-3.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-dark-4.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-dark-5.png",
    alt: "Atomic chess puzzle position with black to move",
  },
  {
    src: "/home-puzzle-dark-6.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-dark-7.png",
    alt: "Atomic chess puzzle position with white to move",
  },
];

const lightModePuzzleCollageImages = [
  {
    src: "/home-puzzle-light-1.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-light-2.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-light-3.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-light-4.png",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-light-5.png",
    alt: "Atomic chess puzzle position with black to move",
  },
  {
    src: "/home-puzzle-light-6.png",
    alt: "Atomic chess puzzle position with black to move",
  },
  {
    src: "/home-puzzle-light-7.png",
    alt: "Atomic chess puzzle position with white to move",
  },
];

const principles = [
  {
    title: "From real games",
    body: (
      <>
        Puzzles come from Lichess games,{" "}
        <a href="https://lichess.org/team/atomic-wc" target="_blank" rel="noreferrer">
          AWC
        </a>
        ,{" "}
        <a
          href="https://lichess.org/team/the-atomic-chess-league"
          target="_blank"
          rel="noreferrer"
        >
          ACL
        </a>
        ,{" "}
        <a href="https://lichess.org/team/atomic960-swiss" target="_blank" rel="noreferrer">
          Atomic960 Swiss
        </a>
        , studies, analysis, and the community.
      </>
    ),
  },
  {
    title: "Form changes fast",
    body: "Monthly ranks and match records make it easier to see what actually changed.",
  },
  {
    title: "Keep the pool clean",
    body: "Rankings exclude cheaters and fair play violators, and known alts are merged under one profile.",
  },
];

export const HomePage = () => {
  const { theme } = useAppSettings();
  const [playerQuery, setPlayerQuery] = useState("");
  const navigate = useNavigate();
  const trimmedPlayerQuery = playerQuery.trim();
  const puzzleCollageImages =
    theme === "light" ? lightModePuzzleCollageImages : darkModePuzzleCollageImages;

  const handlePlayerSearch = async (event) => {
    event.preventDefault();
    if (!trimmedPlayerQuery) return;
    const resolvedUsername = await resolveUsernameInput(trimmedPlayerQuery);
    navigate({
      to: "/@/$username",
      params: { username: normalizeUsername(resolvedUsername) },
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
        <div className="homeHeroCopy">
          <div className="homeKicker">
            <img src={appAssetPath("/favicon.ico")} alt="" width="24" height="24" />
            Atomic puzzles
          </div>
          <h1 id="home-title">Find the move that makes your opponent go boom</h1>
          <p className="homeIntro">
            Solve atomic puzzles, follow top-player matches, and use the ratings to get a better
            read on who is dangerous, who is farming, and who has ideas that actually hold up.
          </p>

          <div className="homeHeroActions">
            <Link className="homePrimaryCta" to="/solve">
              Solve puzzles
            </Link>
            <Link className="homeSecondaryCta" to="/recent">
              View recent matches
            </Link>
          </div>

          <form className="homePlayerSearch" onSubmit={handlePlayerSearch}>
            <label htmlFor="home-player-search">Look up a player</label>
            <div className="homeSearchRow">
              <input
                id="home-player-search"
                type="text"
                value={playerQuery}
                placeholder="username"
                onChange={(event) => setPlayerQuery(event.target.value)}
              />
              <button type="submit" disabled={!trimmedPlayerQuery}>
                View profile
              </button>
            </div>
          </form>
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
              style={{ "--slide-delay": `${index * 7}s` }}
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
      </section>

      <section className="homeContent" aria-label="Atomic training tools and notes">
        <div className="homeSectionIntro">
          <h2>Explore Atomic Chess Tools</h2>
          <p>
            Use the sections below to solve atomic chess puzzles, follow player form, and compare
            results across the current pool.
          </p>
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

      <section className="homeNotesSection" aria-label="Notes for the atomic scene">
        <aside className="homeNotes">
          <span className="homeSectionLabel">For the scene</span>
          <h2>A compact place to train, check names, and follow the pool.</h2>
          <div className="homePrincipleList">
            {principles.map((principle) => (
              <article key={principle.title}>
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </article>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
};
