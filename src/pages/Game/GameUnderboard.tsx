import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { DocumentField } from "../../components/BoardWorkspace/BoardWorkspace";
import type { BoardDocument } from "../../hooks/useBoardDocument";
import { usePersistedState } from "../../hooks/usePersistedState";
import type { ArchiveGame } from "../../lib/archive/games";
import { moveDurationsMilliseconds } from "../../lib/games/moveTimes";
import { buildChessComGameUrl } from "../../lib/matches/routes";
import { copyTextToClipboard } from "../../utils/clipboard";
import { GameMatchCrosstable } from "./GameMatchCrosstable";

type GameUnderboardTab = "move-times" | "crosstable" | "share";
const TAB_STORAGE_KEY = "atomic-puzzles.game.underboard-tab";
const tabSchema = z.enum(["move-times", "crosstable", "share"]);

const formatDuration = (milliseconds: number): string => {
  const seconds = milliseconds / 1_000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
};

const initialClockMilliseconds = (timeControl: string): number | null => {
  const minutes = Number(timeControl.split("+")[0]);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes * 60_000 : null;
};

const clockStepPath = (values: Array<number | null>, maximum: number): string => {
  const points = values
    .map((value, index) =>
      value === null
        ? null
        : {
            x: values.length === 1 ? 0 : (index / (values.length - 1)) * 100,
            y: 100 - (Math.max(0, value) / maximum) * 100,
          },
    )
    .filter((point): point is { x: number; y: number } => point !== null);
  if (!points.length) return "";
  return points
    .map((point, index) =>
      index === 0 ? `M ${point.x} ${point.y}` : `H ${point.x} V ${point.y}`,
    )
    .join(" ");
};

const CopyButton = ({ label, value }: { label: string; value: string }) => {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  return (
    <button
      type="button"
      onClick={() =>
        void copyTextToClipboard(value).then((copied) => setStatus(copied ? "copied" : "error"))
      }
    >
      {status === "copied" ? "Copied" : status === "error" ? "Copy failed" : label}
    </button>
  );
};

export const GameUnderboard = ({
  game,
  currentPly,
  moves,
  document,
  onNavigatePly,
  atomicDbHref,
  atomicDbRequest,
}: {
  game: ArchiveGame;
  currentPly: number;
  moves: string[];
  document: BoardDocument;
  onNavigatePly: (ply: number) => void;
  atomicDbHref: string | null;
  atomicDbRequest?: {
    state: "idle" | "requested" | "error";
    message?: string;
    onRequest: () => void;
  };
}) => {
  const [activeTab, setActiveTab] = usePersistedState<GameUnderboardTab>(
    TAB_STORAGE_KEY,
    tabSchema,
    "move-times",
  );
  const durations = useMemo(() => moveDurationsMilliseconds(game), [game]);
  const availableDurations = durations.filter((duration): duration is number => duration !== null);
  const longestDuration = Math.max(1, ...availableDurations);
  const moveTimePairs = Array.from({ length: Math.ceil(durations.length / 2) }, (_, index) => ({
    moveNumber: index + 1,
    white: durations[index * 2] ?? null,
    black: durations[index * 2 + 1] ?? null,
  }));
  const initialClock = initialClockMilliseconds(game.time_control);
  const hasClockTimeline = initialClock !== null && Boolean(game.clocks?.length);
  const whiteClockSeries = hasClockTimeline
    ? [initialClock, ...moveTimePairs.map((_, index) => game.clocks?.[index * 2] ?? null)]
    : [];
  const blackClockSeries = hasClockTimeline
    ? [initialClock, ...moveTimePairs.map((_, index) => game.clocks?.[index * 2 + 1] ?? null)]
    : [];
  const maximumClock = Math.max(
    1,
    initialClock ?? 0,
    ...(game.clocks?.filter((clock): clock is number => clock !== null) ?? []),
  );
  const whiteClockPath = clockStepPath(whiteClockSeries, maximumClock);
  const blackClockPath = clockStepPath(blackClockSeries, maximumClock);
  const pgn = String(document.pgn.value ?? "");

  const downloadPgn = (): void => {
    const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${game.game_id}.pgn`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tabs: Array<{ id: GameUnderboardTab; label: string }> = [
    { id: "move-times", label: "Move times" },
    { id: "crosstable", label: "Crosstable" },
    { id: "share", label: "Share & export" },
  ];

  return (
    <section className="gameUnderboard">
      <div className="gameUnderboardTabs" role="tablist" aria-label="Game details">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`game-tab-${tab.id}`}
            aria-controls="game-underboard-panel"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="gameUnderboardPanel"
        id="game-underboard-panel"
        role="tabpanel"
        aria-labelledby={`game-tab-${activeTab}`}
      >
        {activeTab === "move-times" ? (
          availableDurations.length ? (
            <figure className="gameMoveTimesFigure" aria-label="Move time chart">
              <figcaption className="gameMoveTimesLegend">
                <span>
                  <i className="white" />
                  White
                </span>
                <span>
                  <i className="black" />
                  Black
                </span>
                <small>{hasClockTimeline ? "Remaining clock • hover for move time" : "Time spent per move"}</small>
              </figcaption>
              <div className="gameMoveTimesViewport">
                {hasClockTimeline ? (
                  <div
                    className="gameClockTimeline"
                    style={{ "--move-pair-count": moveTimePairs.length } as CSSProperties}
                  >
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      aria-hidden="true"
                    >
                      <path className="whiteFill" d={`${whiteClockPath} L 100 100 L 0 100 Z`} />
                      <path className="blackFill" d={`${blackClockPath} L 100 100 L 0 100 Z`} />
                      <path className="whiteLine" d={whiteClockPath} />
                      <path className="blackLine" d={blackClockPath} />
                    </svg>
                    <div className="gameClockTimelineHits">
                      {moveTimePairs.map(({ moveNumber, white, black }) => (
                        <div className="gameClockTimelinePair" key={moveNumber}>
                          {(["white", "black"] as const).map((color) => {
                            const ply = (moveNumber - 1) * 2 + (color === "white" ? 1 : 2);
                            if (ply > durations.length) return <span key={color} />;
                            const duration = color === "white" ? white : black;
                            const remaining = game.clocks?.[ply - 1] ?? null;
                            const move = moves[ply - 1] ?? "Move";
                            const label = `${moveNumber}${color === "white" ? "." : "..."} ${move}: ${duration === null ? "time unavailable" : `${formatDuration(duration)} used`}${remaining === null ? "" : `, ${formatDuration(remaining)} remaining`}`;
                            return (
                              <button
                                key={color}
                                type="button"
                                className={currentPly === ply ? "current" : ""}
                                title={label}
                                aria-label={`Go to ${color} move ${moveNumber}, ${label}`}
                                onClick={() => onNavigatePly(ply)}
                              />
                            );
                          })}
                          <span>{moveNumber}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className="gameMoveTimesChart"
                    style={{ "--move-pair-count": moveTimePairs.length } as CSSProperties}
                  >
                    <span className="gameMoveTimesGrid" aria-hidden="true" />
                  {moveTimePairs.map(({ moveNumber, white, black }) => {
                    const renderMove = (duration: number | null, color: "white" | "black") => {
                      const ply = (moveNumber - 1) * 2 + (color === "white" ? 1 : 2);
                      if (ply > durations.length) return <span className="gameMoveTimeEmpty" />;
                      const label = duration === null ? "—" : formatDuration(duration);
                      return (
                        <button
                          type="button"
                          className={`${color}${currentPly === ply ? " current" : ""}`}
                          style={
                            {
                              "--move-time-height": `${duration === null ? 4 : Math.max(4, (duration / longestDuration) * 100)}%`,
                            } as CSSProperties
                          }
                          title={`${moveNumber}${color === "white" ? "." : "..."} ${moves[ply - 1] ?? "Move"}: ${label}`}
                          aria-label={`Go to ${color} move ${moveNumber}, ${moves[ply - 1] ?? "move"}, ${duration === null ? "time unavailable" : label}`}
                          onClick={() => onNavigatePly(ply)}
                        >
                          <span className="gameMoveTimeBar" />
                          <span className="gameMoveTimeValue">{label}</span>
                        </button>
                      );
                    };

                    return (
                      <div className="gameMoveTimePair" key={moveNumber}>
                        {renderMove(white, "white")}
                        <span className="gameMoveNumber">{moveNumber}</span>
                        {renderMove(black, "black")}
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            </figure>
          ) : (
            <p className="gameUnderboardState">
              No per-move clock data is stored for this game.
            </p>
          )
        ) : null}

        {activeTab === "crosstable" ? <GameMatchCrosstable game={game} embedded /> : null}

        {activeTab === "share" ? (
          <div className="gameSharePanel">
            <div className="gameShareActions">
              {game.source === "chesscom" ? (
                <a href={buildChessComGameUrl(game.game_id)} target="_blank" rel="noreferrer">
                  View on Chess.com
                </a>
              ) : null}
              {atomicDbHref ? (
                <a href={atomicDbHref} target="_blank" rel="noreferrer">
                  View on AtomicDB
                </a>
              ) : atomicDbRequest ? (
                <button
                  type="button"
                  disabled={atomicDbRequest.state === "requested"}
                  onClick={atomicDbRequest.onRequest}
                >
                  {atomicDbRequest.state === "requested"
                    ? "Analysis requested"
                    : atomicDbRequest.state === "error"
                      ? "Retry analysis request"
                      : "Request analysis"}
                </button>
              ) : null}
              <CopyButton
                label="Copy link"
                value={typeof window === "undefined" ? "" : window.location.href}
              />
              <CopyButton label="Copy PGN" value={pgn} />
              <button type="button" onClick={downloadPgn} disabled={!pgn}>
                Download PGN
              </button>
            </div>
            {atomicDbRequest?.state === "error" && atomicDbRequest.message ? (
              <p className="gameShareError" role="alert">
                {atomicDbRequest.message}
              </p>
            ) : null}
            <DocumentField label="FEN" rows={2} field={document.fen} />
            <DocumentField label="PGN" rows={4} field={document.pgn} />
          </div>
        ) : null}
      </div>
    </section>
  );
};
