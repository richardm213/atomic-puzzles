import "./Home.css";

import { Link } from "@tanstack/react-router";

import { Seo } from "../../components/Seo/Seo";
import { appAssetPath } from "../../utils/appAssetPath";

export const HomePage = () => {
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

      </section>

      <section className="homeSpotlightSection" aria-label="Atomic chess shortcuts">
        <div className="homeSpotlightGrid">
          <Link
            className="homeSpotlightCard homeSubmitPuzzleShortcut"
            to="/puzzles/submit"
          >
            <span>Build the library</span>
            <h2>Submit a puzzle</h2>
            <p>Found a brilliant atomic position? Share it with the community.</p>
            <strong>
              Send a puzzle <span aria-hidden="true">→</span>
            </strong>
          </Link>

          <Link className="homeSpotlightCard homePuzzleLeaderboardShortcut" to="/solve/leaderboard">
            <span>Puzzles</span>
            <h2>Puzzle leaderboard</h2>
            <p>Points, correct solves, misses, and total attempts.</p>
          </Link>

          <Link
            className="homeSpotlightCard homePracticeShortcut"
            to="/practice"
          >
            <span>Opening trainer</span>
            <h2>Practice against the database</h2>
            <p>
              Sharpen your opening theory by playing against the database of any top-100
              player in atomic history.
            </p>
          </Link>

          <Link
            className="homeSpotlightCard homeTrophyShortcut homeAtomicHyperShortcut"
            to="/tournaments/$tournamentId"
            params={{ tournamentId: "ahc2026" }}
          >
            <span>Championship</span>
            <h2>Atomic Hyper Championship</h2>
            <p>
              Who will be crowned the Atomic Hyper Champion? Will it be max, jsf, trk, or
              someone else?
            </p>
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
            className="homeSpotlightCard homeTrophyShortcut homeChesscomShortcut"
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
            className="homeSpotlightCard homeTrophyShortcut homeAwcShortcut"
            to="/tournaments/$tournamentId"
            params={{ tournamentId: "awc2025" }}
          >
            <span>Tournament</span>
            <h2>AWC 2025</h2>
            <p>Bracket from last year's controversial World Championship.</p>
            <img
              src={appAssetPath("/images/awc-trophies/awc.png")}
              alt=""
              width="140"
              height="140"
              loading="lazy"
              decoding="async"
            />
          </Link>

          <Link className="homeSpotlightCard homeRecentMatchesShortcut" to="/recent">
            <span>Latest games</span>
            <h2>Recent matches</h2>
            <p>See who's playing, who won, and how the ratings moved.</p>
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
