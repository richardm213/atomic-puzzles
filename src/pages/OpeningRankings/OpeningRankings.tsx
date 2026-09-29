import "./OpeningRankings.css";

import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import { useCallback, useEffect, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import {
  type AtomicDbEvaluation,
  atomicDbPositionUrl,
  fetchAtomicDbPositions,
  getAtomicDbPositionEvaluation,
} from "../../utils/atomicDb";
import { fenAfterUciMove } from "../../utils/chessNotation";

type OpeningDefinition = { move: string; moves: string[] };
type OpeningRanking = OpeningDefinition & {
  evaluation: AtomicDbEvaluation;
  fen: string;
  key: string | null;
};

// These are the established opening lines on this page. Their rankings and evaluations are
// loaded from AtomicDB on every visit rather than being captured here as static values.
const openingDefinitions: OpeningDefinition[] = [
  {
    move: "1. Nf3 f6 2. Nc3",
    moves: ["g1f3", "f7f6", "b1c3"],
  },
  {
    move: "1. Nf3 f6 2. e3",
    moves: ["g1f3", "f7f6", "e2e3"],
  },
  {
    move: "1. Nh3 h6 2. d4",
    moves: ["g1h3", "h7h6", "d2d4"],
  },
  {
    move: "1. Nf3 f6 2. e4",
    moves: ["g1f3", "f7f6", "e2e4"],
  },
  {
    move: "1. Nh3 h6 2. e4",
    moves: ["g1h3", "h7h6", "e2e4"],
  },
  {
    move: "1. e3 e6 2. Nf3",
    moves: ["e2e3", "e7e6", "g1f3"],
  },
  {
    move: "1. Nf3 f6 2. d4",
    moves: ["g1f3", "f7f6", "d2d4"],
  },
  {
    move: "1. d4",
    moves: ["d2d4"],
  },
  {
    move: "1. e4",
    moves: ["e2e4"],
  },
  {
    move: "1. Nh3 h6 2. Nc3",
    moves: ["g1h3", "h7h6", "b1c3"],
  },
  {
    move: "1. Nh3 h6 2. Na3",
    moves: ["g1h3", "h7h6", "b1a3"],
  },
  {
    move: "1. e3 e6 2. Nh3",
    moves: ["e2e3", "e7e6", "g1h3"],
  },
  {
    move: "1. Nh3 h6 2. e3",
    moves: ["g1h3", "h7h6", "e2e3"],
  },
  {
    move: "1. Nh3 h6 2. c3",
    moves: ["g1h3", "h7h6", "c2c3"],
  },
  {
    move: "1. e3 e6 2. Nc3",
    moves: ["e2e3", "e7e6", "b1c3"],
  },
  {
    move: "1. Nc3",
    moves: ["b1c3"],
  },
  {
    move: "1. Nf3 f6 2. Na3",
    moves: ["g1f3", "f7f6", "b1a3"],
  },
  {
    move: "1. Nh3 h6 2. g3",
    moves: ["g1h3", "h7h6", "g2g3"],
  },
  {
    move: "1. Nf3 f6 2. Nd4",
    moves: ["g1f3", "f7f6", "f3d4"],
  },
  {
    move: "1. Nh3 h6 2. b4",
    moves: ["g1h3", "h7h6", "b2b4"],
  },
  {
    move: "1. Nf3 f6 2. c3",
    moves: ["g1f3", "f7f6", "c2c3"],
  },
  {
    move: "1. e3 e6 2. Bb5",
    moves: ["e2e3", "e7e6", "f1b5"],
  },
  {
    move: "1. Nf3 f6 2. Nh4",
    moves: ["g1f3", "f7f6", "f3h4"],
  },
  {
    move: "1. e3 e6 2. Qh5",
    moves: ["e2e3", "e7e6", "d1h5"],
  },
  {
    move: "1. e3 e6 2. Qf3",
    moves: ["e2e3", "e7e6", "d1f3"],
  },
  {
    move: "1. e3 e6 2. Na3",
    moves: ["e2e3", "e7e6", "b1a3"],
  },
  { move: "1. c3", moves: ["c2c3"] },
  { move: "1. g3", moves: ["g2g3"] },
  { move: "1. b4", moves: ["b2b4"] },
  { move: "1. Na3", moves: ["b1a3"] },
  {
    move: "1. e3 e6 2. b4",
    moves: ["e2e3", "e7e6", "b2b4"],
  },
  { move: "1. h3", moves: ["h2h3"] },
  { move: "1. a3", moves: ["a2a3"] },
  { move: "1. f3", moves: ["f2f3"] },
  { move: "1. d3", moves: ["d2d3"] },
  { move: "1. b3", moves: ["b2b3"] },
  { move: "1. f4", moves: ["f2f4"] },
  { move: "1. h4", moves: ["h2h4"] },
  { move: "1. a4", moves: ["a2a4"] },
  { move: "1. g4", moves: ["g2g4"] },
  { move: "1. c4", moves: ["c2c4"] },
];

const fenAfterMoves = (moves: string[]): string | null =>
  moves.reduce<string | null>(
    (fen, move) => (fen ? fenAfterUciMove(fen, move) : null),
    STARTING_FEN,
  );

const openingsWithFens = openingDefinitions.map((opening) => {
  const fen = fenAfterMoves(opening.moves);
  if (!fen) throw new Error(`Invalid opening line: ${opening.move}`);
  return { ...opening, fen };
});
const openingFens = openingsWithFens.map((opening) => opening.fen);

const evaluationSortValue = (evaluation: AtomicDbEvaluation): number => {
  if (evaluation.type === "unknown") return Number.NEGATIVE_INFINITY;
  if (evaluation.type === "centipawns") return evaluation.value;
  return evaluation.value > 0 ? 1_000_000 - evaluation.value : -1_000_000 - evaluation.value;
};

const formatEvaluation = (evaluation: AtomicDbEvaluation): string => {
  if (evaluation.type === "unknown") return "—";
  if (evaluation.type === "mate") {
    return `${evaluation.value < 0 ? "-" : "+"}M${Math.abs(evaluation.value)}`;
  }
  return evaluation.value > 0 ? `+${evaluation.value}` : String(evaluation.value);
};

const evaluationClass = (evaluation: AtomicDbEvaluation): string => {
  if (evaluation.type === "unknown" || evaluation.value === 0) return "equal";
  return evaluation.value > 0 ? "positive" : "negative";
};

const RankingList = ({ entries }: { entries: OpeningRanking[] }) => (
  <ol className="openingRankingList">
    {entries.map((entry, index) => {
      const formattedEvaluation = formatEvaluation(entry.evaluation);
      return (
        <li key={entry.move} className="openingRankingRow">
          <span className="openingRank" aria-label={`Rank ${index + 1}`}>
            {index + 1}
          </span>
          {entry.key ? (
            <a
              className="openingMove"
              href={`${atomicDbPositionUrl(entry.key)}?play=${entry.moves.join("%2C")}`}
              target="_blank"
              rel="noreferrer"
            >
              {entry.move}
            </a>
          ) : (
            <span className="openingMove">{entry.move}</span>
          )}
          <span
            className={`openingEval ${evaluationClass(entry.evaluation)}`}
            aria-label={
              entry.evaluation.type === "unknown"
                ? "Evaluation unavailable"
                : `${formattedEvaluation} for White`
            }
          >
            {formattedEvaluation}
          </span>
        </li>
      );
    })}
  </ol>
);

export const OpeningRankingsPage = () => {
  const [entries, setEntries] = useState<OpeningRanking[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    void fetchAtomicDbPositions(openingFens, controller.signal)
      .then((positions) => {
        if (controller.signal.aborted) return;
        const rankings = openingsWithFens
          .map((opening) => {
            const position = positions[opening.fen] ?? null;
            return {
              ...opening,
              key: position?.key ?? null,
              evaluation: getAtomicDbPositionEvaluation(position, opening.fen),
            };
          })
          .sort(
            (left, right) =>
              evaluationSortValue(right.evaluation) - evaluationSortValue(left.evaluation),
          );
        setEntries(rankings);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [requestKey]);

  const retry = useCallback(() => setRequestKey((current) => current + 1), []);

  return (
    <div className="openingRankingsPage">
      <Seo
        title="Atomic opening rankings"
        description="Rank meaningful opening choices for White using AtomicDB evaluations."
        path="/rankings/openings"
      />
      <div className="panel openingRankingsPanel">
        <header className="openingRankingsHeader">
          <h1>Opening Rankings</h1>
          <a href="https://belzedar.duckdns.org/atomicdb/" target="_blank" rel="noreferrer">
            View on AtomicDB
          </a>
        </header>
        <section className="openingRankingSection" aria-label="Ranked openings">
          {status === "loading" ? (
            <p className="openingRankingsStatus" role="status">
              Loading current evaluations…
            </p>
          ) : null}
          {status === "error" ? (
            <div className="openingRankingsStatus" role="alert">
              <span>Current evaluations could not be loaded.</span>
              <button type="button" onClick={retry}>
                Try again
              </button>
            </div>
          ) : null}
          {status === "ready" ? <RankingList entries={entries} /> : null}
        </section>
      </div>
    </div>
  );
};
