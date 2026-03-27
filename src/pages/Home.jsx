import { Link } from "@tanstack/react-router";

export const HomePage = () => {
  return (
    <div className="homePage">
      <div className="panel homePanel">
        <h1>Atomic Puzzles</h1>
        <p className="homeIntro">
          Welcome! This site helps you solve atomic puzzles, sharpen tactical ability, and keep up
          with the current player rankings and stats.
        </p>

        <section className="homeButtonRow">
          <Link className="primaryCta" to="/solve">
            Solve Puzzles
          </Link>
          <Link className="primaryCta" to="/rankings">
            View Rankings
          </Link>
          <Link className="primaryCta" to="/recent">
            View Recent Matches
          </Link>
        </section>

        <section className="homeDescriptions">
          <article className="homeDescriptionCard">
            <h2>Puzzles and Improvement</h2>
            <p>
              Train with tactical puzzle positions to build pattern recognition, improve calculation
              speed, and perform better in practical atomic games.
            </p>
          </article>
          <article className="homeDescriptionCard">
            <h2>Rankings</h2>
            <p>
              View the top atomic blitz and bullet rankings for the current month. Explore
              historical rankings going back to 2023. Blitz and bullet ratings are tracked
              separately because skill transfer is not one-to-one: hyperbullet farmers and stronger
              blitz players often excel in very different ways.
            </p>
          </article>
          <article className="homeDescriptionCard">
            <h2>Player Stats and Fairness</h2>
            <p>
              Stats are tracked for each player account individually so you can review account-level
              progress over time. Cheaters and alt abusers are excluded from rankings and rating
              calculations to keep the system as fair and meaningful as possible.
            </p>
          </article>
          <article className="homeDescriptionCard">
            <h2>Recent Matches</h2>
            <p>
              Open recent matches for the latest competitive results and momentum checks across the
              strongest active players.
            </p>
          </article>
        </section>
      </div>
    </div>
  );
};
