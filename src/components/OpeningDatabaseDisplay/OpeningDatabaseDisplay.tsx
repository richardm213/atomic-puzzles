import type { CSSProperties } from "react";

import { buildLichessGameUrl } from "../../lib/matches/routes";
import { formatGameCount } from "../../utils/formatters";

const WIN_RATE_LABEL_MIN_PERCENT = 14;

export type OpeningDatabaseMove = {
  uci: string;
  move: string;
  games: number;
  whiteWins: number;
  draws: number;
  blackWins: number;
  white: number;
  draw: number;
  black: number;
  avgOpponentRating: number | null;
  performanceRating: number | null;
};

export type OpeningDatabaseGame = {
  uci: string;
  move: string;
  gameId: string;
  playedOn: string;
  whiteName: string;
  blackName: string;
  whiteRating: number | null;
  blackRating: number | null;
  result: string;
  resultClass: "white" | "draw" | "black";
};

type OpeningDatabaseDisplayProps = {
  moves: OpeningDatabaseMove[];
  recentGames: OpeningDatabaseGame[];
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  emptyMessage: string;
  showPerformance: boolean;
  orientation: "white" | "black";
  currentPly: number;
  onPlayMove: (uci: string) => void;
  onHoverMove: (uci: string | null) => void;
};

const visibleWinRateLabel = (rate: number): string =>
  rate >= WIN_RATE_LABEL_MIN_PERCENT ? `${rate}%` : "";

const WinRateBar = ({
  white,
  draw,
  black,
  avgOpponentRating,
  summary = false,
}: {
  white: number;
  draw: number;
  black: number;
  avgOpponentRating?: number | null;
  summary?: boolean;
}) => (
  <div
    className={`analysisWinRateBar ${summary ? "analysisSummaryWinRateBar" : ""}`}
    title={
      summary
        ? `Shown moves: ${white}% white, ${draw}% draw, ${black}% black`
        : avgOpponentRating
          ? `Average opponent rating: ${avgOpponentRating}`
          : "Average opponent rating unavailable"
    }
    style={
      {
        "--white-rate": `${white}%`,
        "--draw-rate": `${draw}%`,
        "--black-rate": `${black}%`,
      } as CSSProperties
    }
    aria-label={
      summary
        ? `Shown moves: white ${white}%, draw ${draw}%, black ${black}%`
        : `White ${white}%, draw ${draw}%, black ${black}%, average opponent rating ${avgOpponentRating ?? "unavailable"}`
    }
  >
    <span className="white" aria-hidden={white < WIN_RATE_LABEL_MIN_PERCENT}>
      {visibleWinRateLabel(white)}
    </span>
    <span className="draw" aria-hidden={draw < WIN_RATE_LABEL_MIN_PERCENT}>
      {visibleWinRateLabel(draw)}
    </span>
    <span className="black" aria-hidden={black < WIN_RATE_LABEL_MIN_PERCENT}>
      {visibleWinRateLabel(black)}
    </span>
  </div>
);

export const OpeningDatabaseDisplay = ({
  moves,
  recentGames,
  status,
  error,
  emptyMessage,
  showPerformance,
  orientation,
  currentPly,
  onPlayMove,
  onHoverMove,
}: OpeningDatabaseDisplayProps) => {
  const columnCount = showPerformance ? 4 : 3;
  const summary = moves.reduce(
    (total, move) => ({
      games: total.games + move.games,
      whiteWins: total.whiteWins + move.whiteWins,
      draws: total.draws + move.draws,
      blackWins: total.blackWins + move.blackWins,
    }),
    { games: 0, whiteWins: 0, draws: 0, blackWins: 0 },
  );
  const resultCount = summary.whiteWins + summary.draws + summary.blackWins;
  const summaryWhite = resultCount > 0 ? Math.round((summary.whiteWins / resultCount) * 100) : 0;
  const summaryDraw = resultCount > 0 ? Math.round((summary.draws / resultCount) * 100) : 0;
  const summaryBlack = resultCount > 0 ? Math.max(0, 100 - summaryWhite - summaryDraw) : 0;

  return (
    <>
      <table className="analysisExplorerTable">
        <thead>
          <tr>
            <th>Move</th>
            <th>Games</th>
            {showPerformance ? <th>Perf</th> : null}
            <th>Win rate</th>
          </tr>
        </thead>
        <tbody>
          {status === "loading" ? (
            <tr>
              <td colSpan={columnCount} className="analysisExplorerState">
                Loading database moves...
              </td>
            </tr>
          ) : null}
          {status === "error" ? (
            <tr>
              <td colSpan={columnCount} className="analysisExplorerState">
                {error}
              </td>
            </tr>
          ) : null}
          {status === "ready" && moves.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="analysisExplorerState">
                {emptyMessage}
              </td>
            </tr>
          ) : null}
          {moves.map((move) => (
            <tr
              key={move.uci}
              className="analysisExplorerRow"
              role="button"
              tabIndex={0}
              aria-label={`Play ${move.move}`}
              onPointerEnter={() => onHoverMove(move.uci)}
              onPointerLeave={() => onHoverMove(null)}
              onFocus={() => onHoverMove(move.uci)}
              onBlur={() => onHoverMove(null)}
              onClick={() => onPlayMove(move.uci)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                onPlayMove(move.uci);
              }}
            >
              <td>
                <span className="analysisExplorerMove">{move.move}</span>
              </td>
              <td>{formatGameCount(move.games)}</td>
              {showPerformance ? (
                <td
                  className="analysisPerformanceCell"
                  title={
                    move.performanceRating
                      ? `Performance rating estimate: ${move.performanceRating}`
                      : "Performance rating unavailable"
                  }
                >
                  {move.performanceRating ?? "-"}
                </td>
              ) : null}
              <td>
                <WinRateBar
                  white={move.white}
                  draw={move.draw}
                  black={move.black}
                  avgOpponentRating={move.avgOpponentRating}
                />
              </td>
            </tr>
          ))}
        </tbody>
        {status === "ready" && moves.length > 0 ? (
          <tfoot>
            <tr className="analysisExplorerSummaryRow">
              <td>
                <span className="analysisExplorerSummaryMove">Σ</span>
              </td>
              <td>{formatGameCount(summary.games)}</td>
              {showPerformance ? <td>-</td> : null}
              <td>
                <WinRateBar white={summaryWhite} draw={summaryDraw} black={summaryBlack} summary />
              </td>
            </tr>
          </tfoot>
        ) : null}
      </table>

      {status === "ready" && recentGames.length > 0 ? (
        <div className="analysisRecentGames" aria-label="Recent games">
          <span>Recent games</span>
          <ol>
            {recentGames.map((game) => (
              <li key={game.gameId}>
                <a
                  href={buildLichessGameUrl(game.gameId, {
                    orientation,
                    ply: currentPly + (game.uci ? 1 : 0),
                  })}
                  target="_blank"
                  rel="noreferrer"
                  title={`${game.whiteName} vs ${game.blackName}`}
                  onPointerEnter={() => onHoverMove(game.uci || null)}
                  onPointerLeave={() => onHoverMove(null)}
                  onFocus={() => onHoverMove(game.uci || null)}
                  onBlur={() => onHoverMove(null)}
                >
                  <span className="analysisRecentRatings">
                    <span>{game.whiteRating ?? "-"}</span>
                    <span>{game.blackRating ?? "-"}</span>
                  </span>
                  <span className="analysisRecentPlayers">
                    <span>{game.whiteName}</span>
                    <span>{game.blackName}</span>
                  </span>
                  <span className={`analysisRecentResult ${game.resultClass}`}>{game.result}</span>
                  <span className="analysisRecentDate">{game.playedOn.slice(0, 7)}</span>
                  <span className="analysisRecentMove">{game.move}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </>
  );
};
