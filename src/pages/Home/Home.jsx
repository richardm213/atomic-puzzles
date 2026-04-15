import { Link } from "@tanstack/react-router";
import "./Home.css";

const homeActions = [
  { to: "/solve", label: "Solve Puzzles" },
  { to: "/rankings", label: "View Rankings" },
  { to: "/recent", label: "View Recent Matches" },
];

const homeDescriptions = [
  {
    title: "Puzzles and Improvement",
    body: "Train with tactical puzzle positions to build pattern recognition, improve calculation speed, and perform better in practical atomic games.",
  },
  {
    title: "Rankings",
    body: "View the top atomic blitz and bullet rankings for the current month. Explore historical rankings going back to 2023. Blitz and bullet ratings are tracked separately because skill transfer is not one-to-one: hyperbullet farmers and stronger blitz players often excel in very different ways.",
  },
  {
    title: "Player Stats and Fairness",
    body: "Stats are tracked for each player account individually so you can review account-level progress over time. Cheaters and alt abusers are excluded from rankings and rating calculations to keep the system as fair and meaningful as possible.",
  },
  {
    title: "Recent Matches",
    body: "Open recent matches for the latest competitive results and momentum checks across the strongest active players.",
  },
];

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
          {homeActions.map((action) => (
            <Link key={action.to} className="primaryCta" to={action.to}>
              {action.label}
            </Link>
          ))}
        </section>

        <section className="homeDescriptions">
          {homeDescriptions.map((description) => (
            <article key={description.title} className="homeDescriptionCard">
              <h2>{description.title}</h2>
              <p>{description.body}</p>
            </article>
          ))}
        </section>
      </div>
    </div>
  );
};
