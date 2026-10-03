import "./HowCoinsWork.css";

import { Link } from "@tanstack/react-router";

import { Seo } from "../../components/Seo/Seo";
import { DAILY_COIN_BONUS } from "../../lib/coins/coins";
import { appAssetPath } from "../../utils/appAssetPath";

const earningRules = [
  ["Create a published puzzle", 10],
  ["Solve a V1 or V2 puzzle on the first attempt", 2],
  ["Solve a V3 puzzle on the first attempt", 3],
  ["Solve a V4 puzzle on the first attempt", 5],
  ["Solve a V5 puzzle on the first attempt", 10],
  ["Claim the daily bonus", DAILY_COIN_BONUS],
] as const;

export const HowCoinsWorkPage = () => (
  <div className="page coinGuidePage">
    <Seo
      title="How Coins Work"
      description="Learn how to earn and spend Atomic Coins."
      path="/shop/how-coins-work"
    />

    <div className="panel coinGuidePanel">
      <header className="coinGuideHeader">
        <Link className="coinGuideBackLink" to="/shop">
          Back to shop
        </Link>
        <h1>How coins work</h1>
      </header>

      <p className="coinGuideDisclaimer">Cheating will result in a ban from earning prizes.</p>

      <section className="coinGuideSection">
        <h2>Earn coins</h2>
        <dl className="coinRuleList">
          {earningRules.map(([label, amount]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <img src={appAssetPath("/images/coins/gold-coin-stack-v2.png")} alt="" />+{amount}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="coinGuideSection">
        <h2>What counts</h2>
        <ul>
          <li>Only the first attempt changes your coin balance.</li>
          <li>An incorrect V1 or V2 attempt deducts 2 coins; an incorrect V3 deducts 1.</li>
          <li>Incorrect V4 and V5 attempts have no coin penalty.</li>
          <li>Creator coins are awarded when a puzzle is published.</li>
          <li>
            Attempts on your own puzzles are unrated and do not change your coin balance for one
            month after publication. Each unrated retry replaces the last one and restarts the
            one-month wait.
          </li>
          <li>The daily bonus can be claimed once per UTC day.</li>
        </ul>
      </section>

      <section className="coinGuideSection">
        <h2>Redeem coins</h2>
        <p>
          Each reward shows its coin price. Redeeming one deducts the coins immediately and notifies
          an admin to deliver it.
        </p>
      </section>
    </div>
  </div>
);
