import { modeLabels, rankingEligibilityByMode } from "../../constants/matches";
import { Link } from "@tanstack/react-router";
import { Seo } from "../../components/Seo/Seo";
import "./RankingsMethodology.css";

const ratingFaq = [
  {
    title: "Who is included in the pool?",
    body: [
      "The leaderboard is built from a hand-curated player pool rather than every account that has ever appeared in an atomic game. The goal is to keep the field competitive and fair.",
      "Known cheaters are excluded. Accounts used mainly for abuse, sandbagging, or serial alting are also filtered out so the ratings reflect actual play strength instead of account management tricks.",
    ],
  },
  {
    title: "How do aliases and alts work?",
    body: [
      "When multiple accounts clearly belong to the same player, their results are merged into one profile. That keeps the rankings from splitting one player's strength across several names.",
      "You will see one unified player identity on the site even if some games were played under different aliases.",
    ],
  },
  {
    title: "Which games count?",
    body: [
      "Every game against another player in the pool can count, including casual games. That is intentional: some players avoid rated games because they do not want to risk a number they have already reached, so excluding casual play would leave out a meaningful part of the pool.",
      "Most casual games are still played with reasonable effort, so including them is a net positive. For this ladder, opponent quality and game conditions matter more than whether Lichess happened to mark the game as rated.",
    ],
  },
  {
    title: "How are time controls separated?",
    body: [
      "The pools are split by time control. Blitz games feed the blitz leaderboard, bullet games feed the bullet leaderboard, and hyperbullet games feed the hyperbullet leaderboard.",
      "This separation matters because hyperbullet, bullet, and blitz reward different skills. Mixing them into one pool blurs the meaning of each rating.",
    ],
  },
  {
    title: "What happens in arena berserk games?",
    body: [
      "If one player berserks and the other does not, that game is excluded because the conditions are no longer symmetric.",
      "If both players berserk, the game can still count. In that case it is classified by the effective berserked time control, which usually means it lands in bullet.",
    ],
  },
  {
    title: "How are the ratings themselves calculated?",
    body: [
      "The math follows the same Glicko-2 model used by Lichess. There is no custom scoring formula layered on top of it.",
      "In other words, once a game is deemed eligible for the pool and the right time-control bucket, its rating impact is handled the same way a standard Lichess Glicko-2 update would be handled.",
    ],
  },
];

const eligibilityNotes = Object.entries(rankingEligibilityByMode).map(([mode, requirements]) => {
  const label = modeLabels[mode as keyof typeof modeLabels] ?? mode;
  return `A player needs at least ${requirements.minGames} ${mode} games in that month and an RD below ${requirements.maxRd} to appear in the monthly ${label.toLowerCase()} rankings.`;
});

export const RankingsMethodologyPage = () => (
  <div className="rankingsPage">
    <Seo
      title="How Atomic Ratings Work"
      description="Learn how the atomic rankings are built, which games count, how aliases are merged, and how blitz, bullet, and hyperbullet pools are separated."
      path="/rankings/how-ratings-work"
    />
    <div className="panel rankingsPanel methodologyPanel">
      <div className="methodologyHeader">
        <Link className="methodologyBackLink" to="/rankings">
          Back to rankings
        </Link>
        <h1>How Atomic Ratings Work</h1>
        <p>
          These rankings are designed to measure strength inside a cleaner competitive pool, not to
          mirror every atomic result on Lichess. The aim is to build a more reliable field and
          produce ratings that better reflect how strong players actually are.
        </p>
      </div>

      <section className="methodologyIntroCard" aria-label="Summary of the rating system">
        <h2>TLDR</h2>
        <p>
          Ratings are calculated with the same Glicko-2 system Lichess uses. The difference is in
          the pool construction: only vetted players are included, aliases are merged, and only
          games played under fair conditions are allowed to shape the public leaderboard.
        </p>
      </section>

      <div className="methodologySections">
        {ratingFaq.map((item) => (
          <section key={item.title} className="methodologySection">
            <h2>{item.title}</h2>
            {item.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}

        <section id="drunk-accounts" className="methodologySection">
          <h2 className="methodologyIconHeading">
            <span aria-hidden="true">🍺</span>
            <span>How drunk accounts are handled</span>
          </h2>
          <p>
            Some accounts are tagged as drunk accounts. These are accounts a player uses in a way
            that is not meant to reflect their normal playing strength.
          </p>
          <p>
            Games from those accounts are left out of the rating system so one player&apos;s public
            rating is not dragged around by results from intentionally unserious play.
          </p>
          <p>
            This is reviewed case by case rather than applied automatically. In general, the account
            should perform clearly below the player&apos;s main profile, usually by at least 100
            points or more, before it is treated this way.
          </p>
        </section>
      </div>

      <section className="methodologySection methodologyEligibility">
        <h2>Monthly leaderboard eligibility</h2>
        <p>
          The public monthly tables have a minimum sample-size filter so the rankings stay stable
          and meaningful.
        </p>
        <ul>
          {eligibilityNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
    </div>
  </div>
);
