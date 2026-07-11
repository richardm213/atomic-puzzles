import "./Home.css";

import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Seo } from "../../components/Seo/Seo";
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

export const HomePage = () => {
  const [comparePlayerOneQuery, setComparePlayerOneQuery] = useState("");
  const [comparePlayerTwoQuery, setComparePlayerTwoQuery] = useState("");
  const navigate = useNavigate();
  const trimmedComparePlayerOneQuery = comparePlayerOneQuery.trim();
  const trimmedComparePlayerTwoQuery = comparePlayerTwoQuery.trim();

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
          <h1 id="home-title">The best place to train and follow atomic chess</h1>

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
          <Link className="homeSpotlightCard homePuzzleLeaderboardShortcut" to="/solve/leaderboard">
            <span>Puzzles</span>
            <h2>Puzzle leaderboard</h2>
            <p>Points, correct solves, misses, and total attempts.</p>
          </Link>

          <Link
            className="homeSpotlightCard homeTrophyShortcut homeAtomicHyperShortcut"
            to="/tournaments/$tournamentId"
            params={{ tournamentId: "ahc2026" }}
          >
            <span>Championship</span>
            <h2>Atomic Hyper Championship</h2>
            <p>Follow the 2026 bracket, match paths, and championship run.</p>
            <img
              src={appAssetPath("/images/awc-trophies/atomic-hyper-championship.png")}
              alt=""
              width="140"
              height="250"
              loading="lazy"
              decoding="async"
            />
          </Link>

          <Link
            className="homeSpotlightCard homeTrophyShortcut"
            to="/tournaments/$tournamentId"
            params={{ tournamentId: "ccac2026" }}
          >
            <span>Championship</span>
            <h2>Chess.com Atomic 2026</h2>
            <p>wolfram_ep won the 2026 Chess.com atomic championship.</p>
            <img
              src={appAssetPath("/images/awc-trophies/chesscomatomic.png")}
              alt=""
              width="140"
              height="140"
              loading="lazy"
              decoding="async"
            />
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
