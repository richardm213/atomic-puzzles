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
    title: "Atomic puzzle runs",
    body: "Jump into forcing positions, calculate the blast radius, and play the line through on a real board.",
    action: "Start solving",
  },
  {
    to: "/rankings",
    eyebrow: "Measure",
    title: "Monthly ladders",
    body: "Track blitz and bullet separately, browse past months, and keep the noisy pool honest.",
    action: "Open rankings",
  },
  {
    to: "/recent",
    eyebrow: "Scout",
    title: "Recent match room",
    body: "Filter new match sets by mode, rating band, source, date, time control, and match length.",
    action: "See matches",
  },
  {
    to: "/h2h",
    eyebrow: "Compare",
    title: "Head-to-head checks",
    body: "Put two names under the lamp and inspect the rivalry instead of guessing from memory.",
    action: "Compare players",
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

const statCards = [
  { label: "Modes", value: "Blitz + bullet", detail: "Separate ratings, cleaner comparisons" },
  { label: "Archive", value: "Since 2023", detail: "Monthly snapshots for form checks" },
  { label: "Focus", value: "Fair pool", detail: "Cheaters and alt abuse filtered out" },
];

const principles = [
  {
    title: "Built for atomic, not borrowed from chess",
    body: "The trainer is tuned around explosions, king safety, and forcing continuations that normal chess tools tend to flatten.",
  },
  {
    title: "A map of the active scene",
    body: "Rankings, match filters, player pages, and H2H pages give the site a memory of who is playing well right now.",
  },
  {
    title: "Practice with receipts",
    body: "Every route leads back to games, puzzles, ratings, or match records so improvement feels grounded instead of vibes-only.",
  },
];

const activityFeed = [
  "Start a random tactic and play the whole candidate line.",
  "Check who is climbing this month in blitz or bullet.",
  "Search any player page from the nav or the command box here.",
  "Open a recent match and inspect ratings, score flow, and source.",
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
          <h1 id="home-title">Find the move that makes the board disappear.</h1>
          <p className="homeIntro">
            Train atomic tactics, watch the strongest players, and turn match data into a sharper
            feel for who is dangerous, who is farming, and which ideas actually hold up.
          </p>

          <div className="homeHeroActions">
            <Link className="homePrimaryCta" to="/solve">
              Start a puzzle
            </Link>
            <Link className="homeSecondaryCta" to="/recent">
              Scout recent matches
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
                Open profile
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

      <section className="homeStats" aria-label="Site highlights">
        {statCards.map((stat) => (
          <article key={stat.label} className="homeStatCard">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <p>{stat.detail}</p>
          </article>
        ))}
      </section>

      <section className="homeFeatureGrid" aria-label="Primary tools">
        {featureLinks.map((feature) => (
          <Link key={feature.to} className="homeFeatureCard" to={feature.to}>
            <span>{feature.eyebrow}</span>
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
            <strong>{feature.action}</strong>
          </Link>
        ))}
      </section>

      <section className="homeBottom">
        <div className="homePrinciples">
          <span className="homeSectionLabel">What this is becoming</span>
          <h2>An atomic hub for training, scouting, and receipts.</h2>
          <div className="homePrincipleList">
            {principles.map((principle) => (
              <article key={principle.title}>
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </article>
            ))}
          </div>
        </div>

        <aside className="homeActivity" aria-label="Suggested next steps">
          <span className="homeSectionLabel">Good next click</span>
          <ul>
            {activityFeed.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </aside>
      </section>
    </div>
  );
};
