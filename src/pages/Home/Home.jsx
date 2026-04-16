import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { normalizeUsername } from "../../utils/playerNames";
import "./Home.css";

const appAssetPath = (pathname = "/") => {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${import.meta.env.BASE_URL}${normalized.slice(1)}`;
};

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

const puzzleCollageImages = [
  {
    src: "/home-puzzle-1.png",
    webpSrc: "/home-puzzle-1.webp",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-2.png",
    webpSrc: "/home-puzzle-2.webp",
    alt: "Atomic chess puzzle position with black to move",
  },
  {
    src: "/home-puzzle-3.png",
    webpSrc: "/home-puzzle-3.webp",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-4.png",
    webpSrc: "/home-puzzle-4.webp",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-5.png",
    webpSrc: "/home-puzzle-5.webp",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-6.png",
    webpSrc: "/home-puzzle-6.webp",
    alt: "Atomic chess puzzle position with black to move",
  },
  {
    src: "/home-puzzle-7.png",
    webpSrc: "/home-puzzle-7.webp",
    alt: "Atomic chess puzzle position with white to move",
  },
  {
    src: "/home-puzzle-8.png",
    webpSrc: "/home-puzzle-8.webp",
    alt: "Atomic chess puzzle position with black to move",
  },
  {
    src: "/home-puzzle-9.png",
    webpSrc: "/home-puzzle-9.webp",
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
  const [playerQuery, setPlayerQuery] = useState("");
  const navigate = useNavigate();
  const trimmedPlayerQuery = playerQuery.trim();

  const handlePlayerSearch = (event) => {
    event.preventDefault();
    if (!trimmedPlayerQuery) return;
    navigate({
      to: "/@/$username",
      params: { username: normalizeUsername(trimmedPlayerQuery) },
    });
  };

  return (
    <div className="homePage">
      <section className="homeHero" aria-labelledby="home-title">
        <div className="homeHeroCopy">
          <div className="homeKicker">
            <img src={appAssetPath("/favicon.ico")} alt="" width="24" height="24" />
            Atomic chess study room
          </div>
          <h1 id="home-title">Find the move that makes the board go boom.</h1>
          <p className="homeIntro">
            Solve atomic puzzles, follow top-player matches, and use the ratings to get a better
            read on who is dangerous, who is farming, and whose ideas actually hold up.
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
              style={{ "--slide-delay": `${index * 8}s` }}
              aria-hidden="true"
            >
              <source srcSet={appAssetPath(image.webpSrc)} type="image/webp" />
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
