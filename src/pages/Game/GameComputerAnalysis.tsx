import { faSpinner } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type CSSProperties, type FormEvent, useRef, useState } from "react";

import { GAME_ANALYSIS_COST } from "../../../shared/domain/gameAnalysis";
import type { ArchiveGame } from "../../lib/archive/games";
import { decodeGameResult } from "../../lib/archive/games";
import type {
  GameAnalysisRecord,
  GameMoveAssessment,
  MoveClassification,
} from "../../lib/gameAnalysis/gameAnalysis";
import { appAssetPath } from "../../utils/appAssetPath";
import { getErrorMessage } from "../../utils/errors";

const REVIEWED_CLASSIFICATIONS: MoveClassification[] = ["inaccuracy", "mistake", "blunder"];

const labelFor = (classification: MoveClassification, count: number): string => {
  const label = classification[0]!.toUpperCase() + classification.slice(1);
  if (count === 1) return label;
  return classification === "inaccuracy" ? "Inaccuracies" : `${label}s`;
};

const EvaluationGraph = ({
  evaluations,
  moves,
  assessments,
  currentPly,
  startPly,
  onNavigate,
}: {
  evaluations: number[];
  moves: string[];
  assessments: GameMoveAssessment[];
  currentPly: number;
  startPly: number;
  onNavigate: (ply: number) => void;
}) => {
  const [hoveredPly, setHoveredPly] = useState<number | null>(null);
  const width = 1000;
  const height = 230;
  const visibleEvaluations = evaluations
    .map((evaluation, ply) => ({ evaluation, ply }))
    .filter(({ ply }) => ply >= startPly);
  const points = visibleEvaluations.map(({ evaluation, ply }, index) => ({
    evaluation,
    ply,
    x: (index / Math.max(1, visibleEvaluations.length - 1)) * width,
    y: height / 2 - (Math.max(-900, Math.min(900, evaluation)) / 900) * (height / 2 - 8),
  }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const fill = `${path} L${width},${height / 2} L0,${height / 2} Z`;
  const currentPoint = points.find(({ ply }) => ply === currentPly) ?? null;
  const hoveredPoint = hoveredPly === null ? null : points.find(({ ply }) => ply === hoveredPly);
  const hoveredAssessment =
    hoveredPly === null || hoveredPly === 0 ? null : assessments[hoveredPly - 1];
  const hoveredEvaluation = hoveredPly === null ? null : (evaluations[hoveredPly] ?? null);
  const hoveredMove = hoveredPly === null || hoveredPly === 0 ? null : moves[hoveredPly - 1];
  const moveLabel = (ply: number, move = moves[ply - 1] ?? "Move"): string =>
    ply === 0
      ? "Initial position"
      : ply % 2 === 1
        ? `${Math.ceil(ply / 2)}. ${move}`
        : `${ply / 2}... ${move}`;
  const hoveredMoveLabel =
    hoveredPly === null
      ? "Initial position"
      : moveLabel(hoveredPly, hoveredMove ?? hoveredAssessment?.uci ?? "Move");

  return (
    <figure className="gameComputerGraph" aria-label="AtomicDB evaluation graph">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <rect className="blackHalf" x="0" y={height / 2} width={width} height={height / 2} />
        <path className="evaluationFill" d={fill} />
        <line className="evaluationAxis" x1="0" x2={width} y1={height / 2} y2={height / 2} />
        <path className="evaluationLine" d={path} />
        {currentPoint ? (
          <line
            className="currentEvaluation"
            x1={currentPoint.x}
            x2={currentPoint.x}
            y1="0"
            y2={height}
          />
        ) : null}
      </svg>
      <div
        className="gameComputerGraphHits"
        style={{ "--evaluation-count": visibleEvaluations.length } as CSSProperties}
      >
        {visibleEvaluations.map(({ evaluation, ply }) => (
          <button
            key={ply}
            type="button"
            className={currentPly === ply ? "current" : ""}
            aria-label={`Go to ${moveLabel(ply)}, advantage ${evaluation > 0 ? "+" : ""}${(evaluation / 100).toFixed(1)}`}
            onClick={() => onNavigate(ply)}
            onMouseEnter={() => setHoveredPly(ply)}
            onMouseLeave={() => setHoveredPly((current) => (current === ply ? null : current))}
            onFocus={() => setHoveredPly(ply)}
            onBlur={() => setHoveredPly((current) => (current === ply ? null : current))}
          />
        ))}
      </div>
      {hoveredPoint && hoveredEvaluation !== null ? (
        <>
          <i
            className="gameComputerGraphPoint"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
            }}
            aria-hidden="true"
          />
          <div
            className={`gameComputerGraphTooltip ${hoveredPoint.x > width / 2 ? "right" : "left"} ${hoveredPoint.y < height / 2 ? "below" : "above"}`}
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
            }}
            role="tooltip"
          >
            <strong>
              {hoveredMoveLabel}
              {hoveredAssessment &&
              REVIEWED_CLASSIFICATIONS.includes(hoveredAssessment.classification)
                ? ` [${labelFor(hoveredAssessment.classification, 1)}]`
                : ""}
            </strong>
            <span>
              Advantage: {hoveredEvaluation > 0 ? "+" : ""}
              {(hoveredEvaluation / 100).toFixed(1)}
            </span>
          </div>
        </>
      ) : null}
    </figure>
  );
};

const PlayerSummary = ({
  name,
  accuracy,
  averageCentipawnLoss,
  counts,
  color,
}: {
  name: string;
  accuracy: number;
  averageCentipawnLoss: number;
  counts: Record<MoveClassification, number>;
  color: "white" | "black";
}) => {
  return (
    <section className="gameComputerPlayerSummary">
      <div className="gameComputerPlayerHeading">
        <span className={`playerColorMarker ${color}`} aria-hidden="true" />
        <strong>{name}</strong>
      </div>
      <div className="gameComputerPlayerBody">
        <dl>
          {REVIEWED_CLASSIFICATIONS.map((classification) => (
            <div key={classification} className={classification}>
              <dd>{counts[classification]}</dd>
              <dt>{labelFor(classification, counts[classification])}</dt>
            </div>
          ))}
          <div className="averageLoss">
            <dd>{averageCentipawnLoss}</dd>
            <dt>Average centipawn loss</dt>
          </div>
        </dl>
        <p className="gameComputerAccuracy">
          <strong>{accuracy}%</strong> Accuracy
        </p>
      </div>
    </section>
  );
};

export const GameComputerAnalysisPlayers = ({
  game,
  analysis,
}: {
  game: ArchiveGame;
  analysis: GameAnalysisRecord | null;
}) => {
  if (analysis?.status !== "ready" || !analysis.result) return null;
  const players = decodeGameResult(game);
  return (
    <div className="gameComputerSummaries">
      <PlayerSummary
        name={players.white}
        accuracy={analysis.result.whiteAccuracy}
        averageCentipawnLoss={analysis.result.whiteAverageCentipawnLoss}
        counts={analysis.result.whiteCounts}
        color="white"
      />
      <PlayerSummary
        name={players.black}
        accuracy={analysis.result.blackAccuracy}
        averageCentipawnLoss={analysis.result.blackAverageCentipawnLoss}
        counts={analysis.result.blackCounts}
        color="black"
      />
    </div>
  );
};

export const GameComputerAnalysis = ({
  analysis,
  isLoading,
  isRequesting,
  requestError,
  authenticated,
  onRequest,
  moves,
  currentPly,
  evaluationStartPly = 0,
  onNavigate,
}: {
  analysis: GameAnalysisRecord | null;
  isLoading: boolean;
  isRequesting: boolean;
  requestError: unknown;
  authenticated: boolean;
  onRequest: () => void;
  onLogin: () => void;
  moves: string[];
  currentPly: number;
  evaluationStartPly?: number;
  onNavigate: (ply: number) => void;
}) => {
  const purchaseDialogRef = useRef<HTMLDialogElement>(null);
  const closePurchaseDialog = () => purchaseDialogRef.current?.close();
  const openPurchaseDialog = () => {
    purchaseDialogRef.current?.showModal();
  };
  const confirmPurchase = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onRequest();
    closePurchaseDialog();
  };

  if (isLoading) {
    return <p className="gameUnderboardState">Loading computer analysis…</p>;
  }
  if ((!analysis || analysis.status === "failed") && !authenticated) return null;
  if (!analysis || analysis.status === "failed") {
    return (
      <div className="gameComputerRequest">
        <dialog
          ref={purchaseDialogRef}
          className="gameAnalysisPurchaseDialog"
          aria-labelledby="game-analysis-purchase-title"
          onCancel={(event) => {
            if (isRequesting) event.preventDefault();
            else closePurchaseDialog();
          }}
        >
          <form onSubmit={confirmPurchase}>
            <div>
              <h2 id="game-analysis-purchase-title">Request game analysis?</h2>
              <p>
                <img
                  className="gameAnalysisCoinIcon"
                  src={appAssetPath("/images/coins/gold-coin-stack-v2.png")}
                  alt=""
                  aria-hidden="true"
                />
                {GAME_ANALYSIS_COST} Atomic Coin
              </p>
            </div>
            <div className="gameAnalysisPurchaseActions">
              <button type="button" disabled={isRequesting} onClick={closePurchaseDialog}>
                Cancel
              </button>
              <button type="submit" disabled={isRequesting}>
                {isRequesting ? "Requesting…" : "Confirm"}
              </button>
            </div>
          </form>
        </dialog>
        <button type="button" disabled={isRequesting} onClick={openPurchaseDialog}>
          {isRequesting ? <FontAwesomeIcon icon={faSpinner} spin /> : null}
          Request analysis
        </button>
        {analysis?.error || requestError ? (
          <p className="gameComputerError" role="alert">
            {analysis?.error ?? getErrorMessage(requestError, "Unable to request analysis.")}
          </p>
        ) : null}
      </div>
    );
  }
  if (analysis.status !== "ready" || !analysis.result) {
    const progress = Math.round((analysis.completedPositions / analysis.totalPositions) * 100);
    return (
      <div className="gameComputerProgress" aria-live="polite">
        <FontAwesomeIcon icon={faSpinner} spin aria-hidden="true" />
        <strong>
          {analysis.queuedPositions < analysis.totalPositions
            ? "Adding positions to AtomicDB…"
            : "AtomicDB is analyzing this game…"}
        </strong>
        <span>
          {analysis.completedPositions} / {analysis.totalPositions} positions complete
        </span>
        <div
          role="progressbar"
          aria-label="Game analysis progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <i style={{ "--progress": `${progress}%` } as CSSProperties} />
        </div>
      </div>
    );
  }

  return (
    <div className="gameComputerResult">
      <EvaluationGraph
        evaluations={analysis.result.evaluations}
        moves={moves}
        assessments={analysis.result.assessments}
        currentPly={currentPly}
        startPly={evaluationStartPly}
        onNavigate={onNavigate}
      />
    </div>
  );
};
