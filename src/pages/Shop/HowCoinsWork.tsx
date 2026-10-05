import "./HowCoinsWork.css";

import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { Seo } from "../../components/Seo/Seo";
import { DAILY_COIN_BONUS } from "../../lib/coins/coins";
import { appAssetPath } from "../../utils/appAssetPath";

const creationRewards = [
  ["Publish a puzzle", 5],
  ["Not too simple", 3],
  ["Include a clear explanation", 2],
] as const;

const solvingRewards = [
  ["V1 or V2", 2, -2],
  ["V3", 3, -1],
  ["V4", 5, 0],
  ["V5", 10, 0],
] as const;

const CoinAmount = ({ amount }: { amount: number }) => (
  <span className={amount < 0 ? "coinAmount coinAmountPenalty" : "coinAmount"}>
    <img src={appAssetPath("/images/coins/gold-coin-stack-v2.png")} alt="" />
    {amount > 0 ? "+" : ""}
    {amount}
  </span>
);

export const HowCoinsWorkPage = () => (
  <div className="page coinGuidePage">
    <Seo
      title="How to Earn Coins"
      description="Learn how to earn Atomic Coins by creating and solving puzzles."
      path="/shop/how-coins-work"
    />

    <div className="panel coinGuidePanel">
      <header className="coinGuideHeader">
        <Link className="coinGuideBackLink" to="/shop">
          Back to shop
        </Link>
        <h1>How to earn coins</h1>
      </header>

      <p className="coinGuideDisclaimer">
        <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
        Cheating will result in a ban from earning prizes.
      </p>

      <section className="coinGuideSection" aria-label="Coin rewards">
        <div className="coinRewardGroups">
          <section className="coinRewardGroup" aria-labelledby="create-puzzle-rewards">
            <div className="coinRewardGroupHeader">
              <h2 id="create-puzzle-rewards">Create puzzles</h2>
              <span>Up to +10</span>
            </div>
            <dl className="coinRuleList">
              {creationRewards.map(([label, amount]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <CoinAmount amount={amount} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="coinRewardGroup" aria-labelledby="solve-puzzle-rewards">
            <div className="coinRewardGroupHeader">
              <h2 id="solve-puzzle-rewards">Solve puzzles</h2>
            </div>
            <div className="coinOutcomeTableWrap">
              <table className="coinOutcomeTable">
                <thead>
                  <tr>
                    <th scope="col">Level</th>
                    <th scope="col">First-try solve</th>
                    <th scope="col">First-try miss</th>
                  </tr>
                </thead>
                <tbody>
                  {solvingRewards.map(([level, reward, penalty]) => (
                    <tr key={level}>
                      <th scope="row">{level}</th>
                      <td>
                        <CoinAmount amount={reward} />
                      </td>
                      <td>
                        {penalty === 0 ? (
                          <span className="coinNoPenalty">No deduction</span>
                        ) : (
                          <CoinAmount amount={penalty} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="coinDailyReward">
          <span>Claim the daily bonus</span>
          <CoinAmount amount={DAILY_COIN_BONUS} />
        </div>
      </section>
    </div>
  </div>
);
