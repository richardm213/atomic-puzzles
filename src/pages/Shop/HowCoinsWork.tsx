import "./HowCoinsWork.css";

import {
  faArrowRight,
  faCheck,
  faChessKnight,
  faClockRotateLeft,
  faFlag,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import type { PuzzleAttemptColor } from "../../../shared/domain/puzzles/puzzleGrading";
import { PuzzleAttemptResult } from "../../components/PuzzleAttemptResult/PuzzleAttemptResult";
import { Seo } from "../../components/Seo/Seo";
import { formatCoinAmount } from "../../lib/coins/coinDisplay";
import { DAILY_COIN_BONUS } from "../../lib/coins/coins";
import { appAssetPath } from "../../utils/appAssetPath";

const solvingRewards = [
  ["V1", 1, -5],
  ["V2", 2, -3],
  ["V3", 3, -1.5],
  ["V4", 5, -0.5],
  ["V5", 10, 0],
] as const;

const attemptExamples: {
  color: PuzzleAttemptColor;
  result: string;
  correct: boolean;
}[] = [
  { color: "green", result: "Solved on try 1", correct: true },
  { color: "yellow", result: "Solved on try 2", correct: false },
  { color: "orange", result: "Solved on try 3", correct: false },
  { color: "red", result: "Solved on try 4+", correct: false },
  { color: "red", result: "Not solved · 1–2 misses", correct: false },
  { color: "purple", result: "3+ misses without a solve", correct: false },
  { color: "blue", result: "2 clean graded runs in a row", correct: true },
];

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
      description="Puzzle payouts, retry rewards, grading cooldowns, and attempt colors at a glance."
      path="/shop/how-coins-work"
    />
    <div className="panel coinGuidePanel">
      <header className="coinGuideHeader">
        <Link className="coinGuideBackLink" to="/shop">
          Back to shop
        </Link>
        <h1>How to earn coins</h1>
      </header>

      <section className="coinGuideSection" aria-labelledby="solve-puzzle-rewards">
        <h2 id="solve-puzzle-rewards">Solve puzzles</h2>
        <div className="coinOutcomeTableWrap">
          <table className="coinOutcomeTable">
            <thead>
              <tr>
                <th scope="col">Level</th>
                <th scope="col">Solve</th>
                <th scope="col">First miss</th>
              </tr>
            </thead>
            <tbody>
              {solvingRewards.map(([level, reward, penalty]) => (
                <tr key={level}>
                  <th scope="row">{level}</th>
                  <td>
                    <CoinAmount amount={reward} />
                  </td>
                  <td>{penalty === 0 ? "0" : <CoinAmount amount={penalty} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="coinGradingKey">
          <div>
            <dt>Rated</dt>
            <dd>Affects your puzzle rating.</dd>
          </div>
          <div>
            <dt>Graded</dt>
            <dd>Affects your coins and Other Attempts color.</dd>
          </div>
        </dl>
      </section>

      <section className="coinGuideSection" aria-labelledby="retry-rewards-heading">
        <h2 id="retry-rewards-heading">Wrong? You can still earn coins.</h2>
        <p>Keep trying without revealing the solution. Each miss halves the reward left.</p>
        <figure className="coinRetryChart">
          <figcaption>Misses before solving → reward</figcaption>
          <ol>
            {[100, 50, 25, 12.5, 0].map((share, misses) => (
              <li key={misses}>
                <strong>{share}%</strong>
                <div className="coinRetryTrack" aria-hidden="true">
                  <span style={{ height: `${share}%` }} />
                </div>
                <span>
                  {misses === 4 ? "4+" : misses} {misses === 1 ? "miss" : "misses"}
                </span>
              </li>
            ))}
          </ol>
        </figure>
        <p>
          Miss costs: <strong>full → ½ → ¼ → …</strong> Each deduction stays. After 4 misses,
          there’s no solve reward; further misses still cost coins.
        </p>
        <figure className="coinRetryExample">
          <figcaption>V3 example: wrong once, then solve</figcaption>
          <div>
            <span>
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
              <CoinAmount amount={-1.5} />
            </span>
            <FontAwesomeIcon icon={faArrowRight} aria-label="then" />
            <span>
              <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
              <CoinAmount amount={1.5} />
            </span>
            <strong>= 0 net</strong>
          </div>
        </figure>
      </section>

      <section className="coinGuideSection" aria-labelledby="grading-cooldown-heading">
        <h2 id="grading-cooldown-heading">When does grading return?</h2>
        <ol className="coinGradingFlow" aria-label="Grading cycle">
          <li>
            <FontAwesomeIcon icon={faChessKnight} aria-hidden="true" />
            <strong>Graded run</strong>
            <span>Keep trying. Leaving saves your run.</span>
          </li>
          <li>
            <FontAwesomeIcon icon={faFlag} aria-hidden="true" />
            <strong>Solve or resign</strong>
            <span>The run ends.</span>
          </li>
          <li>
            <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
            <strong>Ungraded for 2 months</strong>
            <span>No coins. Attempts aren’t recorded.</span>
          </li>
        </ol>
        <p>
          After 2 months, grading returns. Already solved it? Rewards and penalties are ¼ as much.
        </p>
        <p>
          Any practice attempt—right or wrong—or confirmed resignation restarts the two-month timer.
        </p>
      </section>

      <section className="coinGuideSection" aria-labelledby="attempt-colors-heading">
        <h2 id="attempt-colors-heading">Other Attempts colors</h2>
        <div className="coinAttemptExamples">
          {attemptExamples.map(({ color, result, correct }) => (
            <figure key={result}>
              <figcaption>{result}</figcaption>
              <div className="coinAttemptSample" aria-label={`${result}: example attempt`}>
                <PuzzleAttemptResult
                  color={color}
                  correct={correct}
                  move={correct ? "18. d5" : "18. e4"}
                />
                <span>
                  <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" /> 0:18
                </span>
              </div>
            </figure>
          ))}
        </div>
        <p>The move and time always come from the first attempt. Only the color changes.</p>
      </section>

      <details className="coinGuideDetails">
        <summary>More details: resigning, speed bonuses &amp; colors</summary>
        <div>
          <p>
            <strong>Resigning:</strong> Click twice to confirm. It reveals the solution and ends
            your run, with no extra deduction. You must submit a move first unless you’ve solved the
            puzzle before. Comments, explanations, source links, and other attempts stay hidden
            until you solve or resign.
          </p>
          <p>
            <strong>Speed:</strong> Up to +1 coin on your first clean V1–V3 solve under 30 seconds.
            No speed adjustment on retries or returning runs.
          </p>
          <p>
            <strong>Practice:</strong> No rating, coins, solve history, or color changes, including
            on your own unrated puzzles. A practice run stays practice until it ends.
          </p>
          <p>
            <strong>Colors:</strong> Only graded solves count toward blue. A graded mistake breaks
            the blue streak and restores your original solve color. Green stays green after a later
            miss.
          </p>
          <p>
            <strong>Penalties:</strong> Total miss deductions stay below twice the first-miss
            penalty. Each deduction gets its own notification; solving pays a separate reward. A
            later solve doesn’t undo your first rating result.
          </p>
        </div>
      </details>

      <section className="coinGuideSection" aria-labelledby="create-puzzle-rewards">
        <h2 id="create-puzzle-rewards">Create puzzles</h2>
        <dl className="coinRuleList">
          {[
            ["Publish a puzzle", 5],
            ["Not too simple", 3],
            ["Clear explanation", 2],
          ].map(([label, amount]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                <CoinAmount amount={Number(amount)} />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="coinGuideSection" aria-labelledby="tag-puzzle-rewards">
        <h2 id="tag-puzzle-rewards">Tag puzzles</h2>
        <dl className="coinRuleList">
          <div>
            <dt>Add a visible tag to a puzzle with fewer than 2 tags</dt>
            <dd>
              <CoinAmount amount={0.2} />
            </dd>
          </div>
          <div>
            <dt>First vote below +6 net, or add a visible tag after the first 2</dt>
            <dd>
              <CoinAmount amount={0.1} />
            </dd>
          </div>
          <div>
            <dt>First vote at +6 net or higher</dt>
            <dd>
              <CoinAmount amount={0.01} />
            </dd>
          </div>
        </dl>
        <p>
          No repeat rewards for the same tag, its parents, or subtags. Changing votes earns nothing.
        </p>
      </section>

      <div className="coinDailyReward">
        <span>Daily bonus</span>
        <CoinAmount amount={DAILY_COIN_BONUS} />
      </div>
      <p className="coinGuideDisclaimer">
        <FontAwesomeIcon icon={faTriangleExclamation} aria-hidden="true" />
        Cheating will result in a ban from earning prizes.
      </p>
    </div>
  </div>
);
