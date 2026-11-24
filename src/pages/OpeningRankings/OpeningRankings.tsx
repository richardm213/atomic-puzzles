import "./OpeningRankings.css";

import { INITIAL_FEN as STARTING_FEN } from "chessops/fen";
import { useCallback, useEffect, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import { verifyAtomicDbMates } from "../../lib/atomicDb/analysisMoves";
import {
  type AtomicDbEvaluation,
  atomicDbPositionUrl,
  fetchAtomicDbPositions,
  getAtomicDbPositionEvaluation,
} from "../../utils/atomicDb";
import { fenAfterUciMove, sanLineFromUci } from "../../utils/chessNotation";

type OpeningRanking = {
  label: string;
  moves: string[];
  evaluation: AtomicDbEvaluation;
  fen: string;
  key: string | null;
};

// These are the established opening lines on this page. Their rankings and evaluations are
// loaded from AtomicDB on every visit rather than being captured here as static values.
const openingLines: string[][] = [
  ["g1f3", "f7f6", "b1c3"],
  ["g1f3", "f7f6", "e2e3"],
  ["g1h3", "h7h6", "d2d4"],
  ["g1f3", "f7f6", "e2e4"],
  ["g1h3", "h7h6", "e2e4"],
  ["e2e3", "e7e6", "g1f3"],
  ["g1f3", "f7f6", "d2d4"],
  ["d2d4"],
  ["e2e4"],
  ["g1h3", "h7h6", "b1c3"],
  ["g1h3", "h7h6", "b1a3"],
  ["e2e3", "e7e6", "g1h3"],
  ["g1h3", "h7h6", "e2e3"],
  ["g1h3", "h7h6", "c2c3"],
  ["e2e3", "e7e6", "b1c3"],
  ["b1c3"],
  ["g1f3", "f7f6", "b1a3"],
  ["g1h3", "h7h6", "g2g3"],
  ["g1f3", "f7f6", "f3d4"],
  ["g1h3", "h7h6", "b2b4"],
  ["g1f3", "f7f6", "c2c3"],
  ["e2e3", "e7e6", "f1b5"],
  ["g1f3", "f7f6", "f3h4"],
  ["e2e3", "e7e6", "d1h5"],
  ["e2e3", "e7e6", "d1f3"],
  ["e2e3", "e7e6", "b1a3"],
  ["c2c3"],
  ["g2g3"],
  ["b2b4"],
  ["b1a3"],
  ["e2e3", "e7e6", "b2b4"],
  ["h2h3"],
  ["a2a3"],
  ["f2f3"],
  ["d2d3"],
  ["b2b3"],
  ["f2f4"],
  ["h2h4"],
  ["a2a4"],
  ["g2g4"],
  ["c2c4"],
];

const fenAfterMoves = (moves: string[]): string | null =>
  moves.reduce<string | null>(
    (fen, move) => (fen ? fenAfterUciMove(fen, move) : null),
    STARTING_FEN,
  );

const openingsWithFens = openingLines.map((moves) => {
  const fen = fenAfterMoves(moves);
  if (!fen) throw new Error(`Invalid opening line: ${moves.join(" ")}`);
  const label = sanLineFromUci(STARTING_FEN, moves)
    .filter((_, ply) => ply % 2 === 0)
    .join(" ");
  return { moves, label, fen };
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
        <li key={entry.moves.join(" ")} className="openingRankingRow">
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
              {entry.label}
            </a>
          ) : (
            <span className="openingMove">{entry.label}</span>
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
      .then(async (positions) => {
        if (controller.signal.aborted) return;
        const byEvaluation = (left: OpeningRanking, right: OpeningRanking) =>
          evaluationSortValue(right.evaluation) - evaluationSortValue(left.evaluation);
        const rankings = openingsWithFens.map((opening) => {
          const position = positions[opening.fen] ?? null;
          return {
            ...opening,
            key: position?.key ?? null,
            evaluation: getAtomicDbPositionEvaluation(position, opening.fen),
          };
        });
        setEntries([...rankings].sort(byEvaluation));
        setStatus("ready");
        const verified = await Promise.all(
          rankings.map(async (ranking) => {
            const position = positions[ranking.fen];
            if (!position) return ranking;
            const result = await verifyAtomicDbMates(
              ranking.fen,
              { position, lines: {} },
              controller.signal,
            ).catch(() => null);
            if (!result || result.position === position) return ranking;
            return {
              ...ranking,
              evaluation: getAtomicDbPositionEvaluation(result.position, ranking.fen),
            };
          }),
        );
        if (
          !controller.signal.aborted &&
          verified.some((entry, index) => entry !== rankings[index])
        ) {
          setEntries(verified.sort(byEvaluation));
        }
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
