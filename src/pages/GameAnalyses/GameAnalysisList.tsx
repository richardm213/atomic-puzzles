import { Link } from "@tanstack/react-router";

import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import type { AdminGameAnalysis } from "../../lib/gameAnalysis/admin";
import { formatLocalDateTime } from "../../utils/formatters";

export type GameAnalysisListKind = "pending" | "completed" | "failed";

export const GameAnalysisRow = ({
  analysis,
  kind,
}: {
  analysis: AdminGameAnalysis;
  kind: GameAnalysisListKind;
}) => {
  const progress = analysis.totalMoves
    ? Math.round((analysis.completedMoves / analysis.totalMoves) * 100)
    : 100;
  const completed = kind === "completed";
  const failed = kind === "failed";
  const timestamp = completed
    ? (analysis.completedAt ?? analysis.updatedAt)
    : analysis.lastCheckedAt;
  const checkOverdue = analysis.nextCheckAt
    ? Date.parse(analysis.nextCheckAt) <= Date.now()
    : false;

  return (
    <li className="gameAnalysesRow">
      <div className="gameAnalysesGame">
        <span className="gameAnalysesMobileLabel">Game</span>
        <Link to="/game/$gameId" params={{ gameId: analysis.gameId }}>
          {analysis.gameId}
        </Link>
      </div>
      <div className="gameAnalysesProgress">
        <span className="gameAnalysesMobileLabel">Progress</span>
        <div>
          <span>
            {analysis.completedMoves} / {analysis.totalMoves}
          </span>
          {!completed && !failed ? (
            <progress value={analysis.completedMoves} max={Math.max(1, analysis.totalMoves)}>
              {progress}%
            </progress>
          ) : null}
          {!completed ? (
            <small className={failed ? "gameAnalysesFailure" : undefined}>
              {failed
                ? (analysis.error ?? "Analysis failed without an error message.")
                : `${analysis.status === "queued" ? "Waiting to submit" : "Processing"} · ${analysis.queuedMoves} of ${analysis.totalMoves} moves queued`}
            </small>
          ) : null}
        </div>
      </div>
      <div className="gameAnalysesRequester">
        <span className="gameAnalysesMobileLabel">Requester</span>
        <PlayerLink username={analysis.requestedBy}>{analysis.requestedBy}</PlayerLink>
      </div>
      <div className="gameAnalysesTime">
        <span className="gameAnalysesMobileLabel">{completed ? "Completed" : "Checked"}</span>
        {timestamp ? (
          <time dateTime={timestamp}>{formatLocalDateTime(timestamp)}</time>
        ) : (
          <span>Not checked yet</span>
        )}
        {analysis.nextCheckAt ? (
          <small>
            {checkOverdue ? "Check overdue:" : "Next check:"}
            <time dateTime={analysis.nextCheckAt}>{formatLocalDateTime(analysis.nextCheckAt)}</time>
          </small>
        ) : null}
      </div>
    </li>
  );
};

export const GameAnalysisColumnLabels = ({ completed = false }: { completed?: boolean }) => (
  <div className="gameAnalysesColumns" aria-hidden="true">
    <span>Game</span>
    <span>Progress</span>
    <span>Requester</span>
    <span>{completed ? "Completed" : "Checked"}</span>
  </div>
);
