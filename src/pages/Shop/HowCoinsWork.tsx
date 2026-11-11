import "./HowCoinsWork.css";

import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { Seo } from "../../components/Seo/Seo";
import { formatCoinAmount } from "../../lib/coins/coinDisplay";
import { DAILY_COIN_BONUS } from "../../lib/coins/coins";
import { calculateCorrectAttemptSpeedBonus } from "../../lib/coins/speedBonus";
import { appAssetPath } from "../../utils/appAssetPath";

const creationRewards = [
  ["Publish a puzzle", 5],
  ["Not too simple", 3],
  ["Include a clear explanation", 2],
] as const;

const solvingRewards = [
  ["V1", 1, -5],
  ["V2", 2, -3],
  ["V3", 3, -1.5],
  ["V4", 5, -0.5],
  ["V5", 10, 0],
] as const;

const speedAdjustmentSeconds = [3, 5, 10, 15, 20, 25, 30] as const;

const retryRewards = [
  ["0", "100%", "Speed bonus on your first-ever, first-try solve"],
  ["1", "50%", "No speed adjustment"],
  ["2", "25%", "No speed adjustment"],
  ["3", "12.5%", "No speed adjustment"],
  ["4 or more", "No reward", "Further graded mistakes still cost coins"],
] as const;

const attemptColors = [
  ["Green", "Solved on try 1"],
  ["Yellow", "Solved on try 2"],
  ["Orange", "Solved on try 3"],
  ["Red", "Solved on try 4 or later, or unsolved after 1–2 misses"],
  ["Purple", "Unsolved after 3 or more misses"],
  ["Blue", "Two consecutive correct graded runs, with no mistakes in either run"],
] as const;

const returningPuzzleRules = [
  [
    "Wrong during a graded run that is still open",
    "Graded",
    "Continue with the same miss count and remaining reward, even after leaving the page.",
  ],
  [
    "Wrong before, run ended less than two months ago",
    "Practice",
    "Wait for grading to return. Practice submissions are saved without coin changes.",
  ],
  [
    "Wrong before, cooldown expired, never solved",
    "Graded",
    "Start a fresh run at full base stakes. The rating result from your first attempt stays recorded.",
  ],
  [
    "Solved before, still on cooldown",
    "Practice",
    "A correct practice solve restarts the two-month timer.",
  ],
  [
    "Solved before, cooldown expired",
    "Graded",
    "Start a fresh run at one quarter of the base reward and penalty.",
  ],
] as const;

const CoinAmount = ({ amount }: { amount: number }) => (
  <span className={amount < 0 ? "coinAmount coinAmountPenalty" : "coinAmount"}>
    <img src={appAssetPath("/images/coins/gold-coin-stack-v2.png")} alt="" />
    {formatCoinAmount(amount)}
  </span>
);

export const HowCoinsWorkPage = () => (
  <div className="page coinGuidePage">
    <Seo
      title="How to Earn Coins"
      description="Learn how to earn Atomic Coins through puzzle creation, rated attempts, grading, repeat solves, and tagging."
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
            <p>
              <strong>You can earn coins after getting a puzzle wrong.</strong> Keep the solution
              hidden and continue your graded run. A correct retry after one, two, or three misses
              earns a reduced reward. Your earlier deductions remain, and your first rating result
              stays recorded.
            </p>
            <p>
              Your first-ever submitted result on a puzzle is rated and graded. Rated results affect
              your puzzle rating. Graded results determine coin rewards, penalties, and your color
              in Other Attempts. Later submissions affect coins only when grading is available. A
              first-result rating loss stays even if you later solve the puzzle.
            </p>
            <p>
              The amounts below are the base reward and first-miss penalty for a graded run. A run
              starts when you submit your first move and ends when you solve or confirm resignation.
              Refreshing, closing the tab, or returning later resumes an unfinished run.
            </p>
            <div className="coinOutcomeTableWrap">
              <table className="coinOutcomeTable">
                <thead>
                  <tr>
                    <th scope="col">Level</th>
                    <th scope="col">Base reward</th>
                    <th scope="col">First-miss penalty</th>
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
            <section className="coinGradingRules" aria-labelledby="retry-rewards-heading">
              <h3 id="retry-rewards-heading">Keep trying within a run</h3>
              <p>
                Continue working on the puzzle after a wrong submission to keep your remaining
                reward available. Each miss halves that reward. A solve after one miss earns 50%,
                after two earns 25%, and after three earns 12.5%. Four misses end reward eligibility
                for that run. Refreshing or leaving the page preserves your run and miss count.
              </p>
              <div className="coinOutcomeTableWrap">
                <table className="coinOutcomeTable">
                  <thead>
                    <tr>
                      <th scope="col">Misses before solving</th>
                      <th scope="col">Share of base reward</th>
                      <th scope="col">Adjustment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retryRewards.map(([misses, reward, adjustment]) => (
                      <tr key={misses}>
                        <th scope="row">{misses}</th>
                        <td>{reward}</td>
                        <td>{adjustment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Each graded mistake is saved. Each coin deduction is permanent and sends its own
                notification. The first costs the full penalty, the second half, the third a
                quarter, and so on. With enough coins in your wallet, the total approaches twice the
                first-miss penalty. Further graded mistakes still incur these decreasing penalties
                after four misses. Solving pays a separate reward and keeps the earlier deductions
                in your history.
              </p>
              <p>
                For example, a V3 puzzle has a 3-coin base reward and a 1.5-coin first-miss penalty.
                Get it wrong once, keep the solution hidden, then solve it to earn 1.5 coins. The
                deduction and reward balance out. After two misses, the deductions total 2.25 coins
                and the solve pays 0.75 coins, giving a net change of −1.5 coins.
              </p>
            </section>

            <section className="coinGradingRules" aria-labelledby="reveal-solution-heading">
              <h3 id="reveal-solution-heading">Keeping the solution hidden</h3>
              <p>
                Explanations, comments, other players’ attempts, and source-match links stay locked
                until you solve or confirm resignation. On a previously solved puzzle, resignation
                is available before making another move. On a puzzle you have never solved,
                resignation becomes available after a wrong submission. Click once to highlight it
                and a second time to confirm and reveal the solution. Confirming ends your current
                run and its remaining reward eligibility.
              </p>
              <p>
                Before submitting a move, you can leave or skip freely. Each coin deduction during a
                graded run sends its own notification. A later correct solve sends a separate reward
                notification. Retries have no speed bonus or penalty.
              </p>
            </section>

            <section className="coinGradingRules" aria-labelledby="grading-cooldown-heading">
              <h3 id="grading-cooldown-heading">Grading cooldown and repeat solves</h3>
              <p>
                Completing a solve or confirming resignation starts a two-month grading cooldown.
                Attempts during the cooldown are saved as practice. They carry no coin rewards, coin
                penalties, or rating changes. Completing another correct solve during the cooldown
                restarts the two-month timer. Confirming resignation again also restarts it,
                including before a move on a puzzle you have already solved.
              </p>
              <p>
                When the cooldown expires, you can start a fresh graded run with its miss counter
                reset. Previously solved puzzles earn one quarter of the base reward and charge one
                quarter of the base penalty. The same retry reductions and four-miss reward cutoff
                apply to those reduced amounts. Returning graded runs have no speed adjustment.
              </p>
              <p>
                Resignation adds no extra miss, debit, or rating change. On later visits, your
                eligibility shows “Graded” or a countdown such as “Grading returns in 1.8 months.”
                This status stays hidden throughout your initial run, including retries. An open
                practice run stays practice until it ends, even if its original cooldown expires
                while you are working on it.
              </p>
              <p>
                A correct practice solve still marks the puzzle as solved. Future graded runs then
                use quarter stakes. Practice results leave your Other Attempts color and blue streak
                unchanged.
              </p>
            </section>

            <section className="coinGradingRules" aria-labelledby="returning-puzzle-heading">
              <h3 id="returning-puzzle-heading">Returning to a puzzle you already tried</h3>
              <div className="coinOutcomeTableWrap">
                <table className="coinOutcomeTable coinReturningTable">
                  <thead>
                    <tr>
                      <th scope="col">Your history</th>
                      <th scope="col">Eligibility</th>
                      <th scope="col">What happens next</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returningPuzzleRules.map(([history, eligibility, next]) => (
                      <tr key={history}>
                        <th scope="row">{history}</th>
                        <td>{eligibility}</td>
                        <td>{next}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="coinGradingRules" aria-labelledby="attempt-colors-heading">
              <h3 id="attempt-colors-heading">Other Attempts colors</h3>
              <p>
                Every submission and resignation is saved. Other Attempts shows one row per player,
                always using the move and time from their first attempt. The color updates with
                graded results. Hover over its colored indicator for the explanation.
              </p>
              <div className="coinOutcomeTableWrap">
                <table className="coinOutcomeTable">
                  <thead>
                    <tr>
                      <th scope="col">Color</th>
                      <th scope="col">Graded result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attemptColors.map(([color, result]) => (
                      <tr key={color}>
                        <th scope="row">{color}</th>
                        <td>{result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Try counts belong to the run that produced the solve. Blue counts only graded runs,
                with the repeat solve occurring after the grading cooldown. A practice solve during
                cooldown cannot earn blue. A graded mistake resets the blue streak and restores your
                original solve color. If your first attempt was correct, a later incorrect attempt
                leaves you green.
              </p>
            </section>

            <section className="coinGradingRules" aria-labelledby="speed-adjustment-heading">
              <h3 id="speed-adjustment-heading">First-try speed bonus</h3>
              <p className="coinSpeedAdjustmentCaption">
                A correct first-ever, first-try solve on a V1–V3 puzzle earns a small speed bonus
                when completed in under 30 seconds. Retries and returning graded runs have no speed
                bonus or penalty.
              </p>
              <div className="coinOutcomeTableWrap">
                <table className="coinOutcomeTable">
                  <thead>
                    <tr>
                      <th scope="col">Attempt time</th>
                      <th scope="col">V1–V3 solve bonus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {speedAdjustmentSeconds.map((seconds) => {
                      const bonus = calculateCorrectAttemptSpeedBonus(3, seconds * 1_000);
                      return (
                        <tr key={seconds}>
                          <th scope="row">{seconds} sec</th>
                          <td>
                            {bonus === 0 ? (
                              <span className="coinNoPenalty">No bonus</span>
                            ) : (
                              <CoinAmount amount={bonus} />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </section>

          <section className="coinRewardGroup" aria-labelledby="tag-puzzle-rewards">
            <div className="coinRewardGroupHeader">
              <h2 id="tag-puzzle-rewards">Tag puzzles</h2>
            </div>
            <dl className="coinRuleList">
              <div>
                <dt>Propose a tag that becomes visible on a puzzle with fewer than two tags</dt>
                <dd>
                  <CoinAmount amount={0.2} />
                </dd>
              </div>
              <div>
                <dt>
                  Cast your first vote on a visible tag below +6 net, or propose a tag that becomes
                  visible on a puzzle with two or more tags
                </dt>
                <dd>
                  <CoinAmount amount={0.1} />
                </dd>
              </div>
              <div>
                <dt>Cast your first vote on a tag already at +6 net or higher</dt>
                <dd>
                  <CoinAmount amount={0.01} />
                </dd>
              </div>
            </dl>
            <p>
              Earning a reward for a tag rules out rewards for the same tag, its parents, and its
              subtags on that puzzle. Changing or removing a vote doesn’t earn coins.
            </p>
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
