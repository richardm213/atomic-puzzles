import { faCheck, faClipboard } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { WOLFRANDOM_RANDOMIZED_PLIES } from "../../../shared/domain/gameAnalysis";
import {
  ChessComProfileIcon,
  LichessProfileIcon,
} from "../../features/profile/profilePresentation";
import type { BoardDocument } from "../../hooks/useBoardDocument";
import { usePersistedState } from "../../hooks/usePersistedState";
import type { ArchiveGame } from "../../lib/archive/games";
import { moveDurationsMilliseconds } from "../../lib/games/moveTimes";
import { buildChessComGameUrl, buildLichessGameUrl } from "../../lib/matches/routes";
import { copyTextToClipboard } from "../../utils/clipboard";
import { GameMatchCrosstable } from "./GameMatchCrosstable";

export type GameUnderboardTab = "analysis" | "move-times" | "crosstable" | "share";
const TAB_STORAGE_KEY = "atomic-puzzles.game.underboard-tab";
const tabSchema = z.enum(["analysis", "move-times", "crosstable", "share"]);

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

const clockLinePath = (
  clocks: number[],
  maximum: number,
  color: "white" | "black",
  plyCount: number,
  startPly = 0,
): string => {
  const side = color === "white" ? 0 : 1;
  const visiblePlyCount = Math.max(0, plyCount - startPly);
  const moveCount = Math.max(1, Math.ceil(visiblePlyCount / 2));
  const slotCount = moveCount + (visiblePlyCount % 2 === 0 ? 0.5 : 0);
  const previousClock = clocks
    .slice(0, startPly)
    .map((value, ply) => ({ value, ply }))
    .filter(({ ply }) => ply % 2 === side)
    .at(-1)?.value;
  const yForClock = (value: number): number =>
    color === "white"
      ? 4 + (1 - Math.max(0, value) / maximum) * 42
      : 96 - (1 - Math.max(0, value) / maximum) * 42;
  const points = [
    {
      x: 0,
      y: previousClock === undefined ? (color === "white" ? 4 : 96) : yForClock(previousClock),
    },
    ...clocks.flatMap((value, ply) =>
      ply >= startPly && ply % 2 === side
        ? [
            {
              x:
                ((Math.floor((ply - startPly) / 2) + 1 + (color === "black" ? 0.5 : 0)) /
                  slotCount) *
                100,
              y: yForClock(value),
            },
          ]
        : [],
    ),
  ];
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
};

const moveTimePlotValue = (milliseconds: number): number => {
  const centiseconds = Math.min(milliseconds / 10, 120_000);
  return Math.log(0.005 * centiseconds + 3) ** 2 - Math.log(3) ** 2;
};

const formatGameDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatClockForChart = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatMoveTimeForChart = (milliseconds: number): string => {
  const seconds = milliseconds / 1_000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)} seconds`;
};

const CopyButton = ({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) => {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const statusLabel = status === "copied" ? "Copied" : status === "error" ? "Copy failed" : label;
  return (
    <button
      type="button"
      className={compact ? "gameShareCopyButton" : undefined}
      aria-label={statusLabel}
      title={statusLabel}
      onClick={() =>
        void copyTextToClipboard(value).then((copied) => setStatus(copied ? "copied" : "error"))
      }
    >
      {compact ? (
        <FontAwesomeIcon icon={status === "copied" ? faCheck : faClipboard} />
      ) : (
        statusLabel
      )}
    </button>
  );
};

const ShareDocumentField = ({
  label,
  rows,
  field,
}: {
  label: "FEN" | "PGN";
  rows: number;
  field: BoardDocument["fen"];
}) => {
  const { error, ...textareaProps } = field;
  return (
    <div className={`gameShareDocumentRow ${label === "PGN" ? "gameSharePgnRow" : ""}`}>
      <div className="gameShareDocumentHeader">
        <span>{label}</span>
        <CopyButton label={`Copy ${label}`} value={String(field.value ?? "")} compact />
      </div>
      <textarea
        {...textareaProps}
        rows={rows}
        spellCheck={false}
        aria-label={label}
        aria-invalid={Boolean(error)}
      />
      {error ? (
        <small className="gameShareDocumentError" role="alert">
          {error}
        </small>
      ) : null}
    </div>
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
  computerAnalysis,
  computerAnalysisEnabled,
  onActiveTabChange,
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
  computerAnalysis: ReactNode;
  computerAnalysisEnabled: boolean;
  onActiveTabChange?: (tab: GameUnderboardTab) => void;
}) => {
  const [activeTab, setActiveTab] = usePersistedState<GameUnderboardTab>(
    TAB_STORAGE_KEY,
    tabSchema,
    "analysis",
  );
  const [hoveredPly, setHoveredPly] = useState<number | null>(null);
  const [hoveredTooltipX, setHoveredTooltipX] = useState<number | null>(null);
  const previousComputerAnalysisEnabled = useRef(computerAnalysisEnabled);
  const durations = useMemo(() => moveDurationsMilliseconds(game), [game]);
  const availableDurations = durations.filter((duration): duration is number => duration !== null);
  const chartStartPly = game.mode === "wolfrandom" ? WOLFRANDOM_RANDOMIZED_PLIES : 0;
  const visibleDurations = durations.slice(chartStartPly);
  const visibleAvailableDurations = visibleDurations.filter(
    (duration): duration is number => duration !== null,
  );
  const longestDuration = Math.max(1, ...visibleAvailableDurations);
  const firstMoveNumber = Math.floor(chartStartPly / 2) + 1;
  const moveTimePairs = Array.from(
    { length: Math.ceil(visibleDurations.length / 2) },
    (_, index) => {
      const moveNumber = firstMoveNumber + index;
      return {
        moveNumber,
        white: durations[(moveNumber - 1) * 2] ?? null,
        black: durations[(moveNumber - 1) * 2 + 1] ?? null,
      };
    },
  );
  const timelineSlotCount = Math.max(
    1,
    moveTimePairs.length + (visibleDurations.length % 2 === 0 ? 0.5 : 0),
  );
  const initialClock = initialClockMilliseconds(game.time_control);
  const hasClockTimeline = initialClock !== null && (game.clocks?.length ?? 0) > 0;
  const maximumClock = Math.max(
    1,
    initialClock ?? 0,
    ...(game.clocks?.filter((clock): clock is number => clock !== null) ?? []),
  );
  const whiteClockPath = clockLinePath(
    game.clocks ?? [],
    maximumClock,
    "white",
    durations.length,
    chartStartPly,
  );
  const blackClockPath = clockLinePath(
    game.clocks ?? [],
    maximumClock,
    "black",
    durations.length,
    chartStartPly,
  );
  const plottedMoveTimes = durations.map((duration) =>
    duration === null ? null : moveTimePlotValue(duration),
  );
  const maximumMoveTimePlot = Math.max(
    1,
    ...plottedMoveTimes.slice(chartStartPly).filter((value): value is number => value !== null),
  );
  const gameDuration = availableDurations.reduce((total, duration) => total + duration, 0);
  const hoveredClock = hoveredPly === null ? null : (game.clocks?.[hoveredPly - 1] ?? null);
  const hoveredDuration = hoveredPly === null ? null : (durations[hoveredPly - 1] ?? null);
  const hoveredColor = hoveredPly !== null && hoveredPly % 2 === 1 ? "white" : "black";
  const hoveredClockY =
    hoveredClock === null
      ? 50
      : hoveredColor === "white"
        ? 4 + (1 - Math.max(0, hoveredClock) / maximumClock) * 42
        : 96 - (1 - Math.max(0, hoveredClock) / maximumClock) * 42;
  const pgn = String(document.pgn.value ?? "");

  useEffect(() => {
    onActiveTabChange?.(activeTab);
  }, [activeTab, onActiveTabChange]);

  useEffect(() => {
    if (previousComputerAnalysisEnabled.current === computerAnalysisEnabled) return;
    previousComputerAnalysisEnabled.current = computerAnalysisEnabled;
    setActiveTab(computerAnalysisEnabled ? "analysis" : "move-times");
  }, [computerAnalysisEnabled, setActiveTab]);

  const showClockTooltip = (ply: number, target: HTMLElement): void => {
    const timeline = target.closest<HTMLElement>(".gameClockTimeline");
    const viewport = target.closest<HTMLElement>(".gameMoveTimesViewport");
    if (!timeline || !viewport) return;
    const targetRect = target.getBoundingClientRect();
    const timelineRect = timeline.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const tooltipHalfWidth = 82;
    const viewportLeft = viewportRect.left - timelineRect.left + tooltipHalfWidth;
    const viewportRight = viewportRect.right - timelineRect.left - tooltipHalfWidth;
    const targetCenter = targetRect.left + targetRect.width / 2 - timelineRect.left;
    setHoveredPly(ply);
    setHoveredTooltipX(Math.max(viewportLeft, Math.min(viewportRight, targetCenter)));
  };

  const hideClockTooltip = (): void => {
    setHoveredPly(null);
    setHoveredTooltipX(null);
  };

  const downloadPgn = (): void => {
    const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${game.game_id}.pgn`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tabs: Array<{ id: GameUnderboardTab; label: string }> = [
    { id: "analysis", label: "Computer analysis" },
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
            aria-keyshortcuts={tab.id === "analysis" ? "Z" : undefined}
            disabled={tab.id === "analysis" && !computerAnalysisEnabled}
            title={
              tab.id === "analysis" && !computerAnalysisEnabled
                ? "Press Z to enable computer analysis"
                : undefined
            }
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
        {activeTab === "analysis" ? computerAnalysis : null}
        {activeTab === "move-times" ? (
          visibleAvailableDurations.length ? (
            <figure className="gameMoveTimesFigure" aria-label="Move time chart">
              {hasClockTimeline ? null : (
                <figcaption className="gameMoveTimesLegend">
                  <span>
                    <i className="white" />
                    White
                  </span>
                  <span>
                    <i className="black" />
                    Black
                  </span>
                  <small>Time spent per move</small>
                </figcaption>
              )}
              <div className="gameMoveTimesViewport">
                {hasClockTimeline ? (
                  <div
                    className="gameClockTimeline"
                    style={{ "--move-pair-count": moveTimePairs.length } as CSSProperties}
                  >
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <line className="clockAxis" x1="0" x2="100" y1="50" y2="50" />
                      <path className="whiteFill" d={`${whiteClockPath} L 100 50 L 0 50 Z`} />
                      <path className="blackFill" d={`${blackClockPath} L 100 50 L 0 50 Z`} />
                      {plottedMoveTimes.map((plotValue, ply) => {
                        if (plotValue === null || ply < chartStartPly) return null;
                        const step = 100 / timelineSlotCount;
                        const height = Math.max(0.8, (plotValue / maximumMoveTimePlot) * 43);
                        const white = ply % 2 === 0;
                        return (
                          <rect
                            key={ply}
                            className={white ? "whiteMoveTime" : "blackMoveTime"}
                            x={((ply - chartStartPly) * step) / 2}
                            y={white ? 50 - height : 50}
                            width={step}
                            height={height}
                          />
                        );
                      })}
                      <path className="whiteLine" d={whiteClockPath} />
                      <path className="blackLine" d={blackClockPath} />
                      <line
                        className="currentPlyLine"
                        x1={
                          currentPly <= chartStartPly
                            ? 0
                            : ((currentPly - chartStartPly + 1) / 2 / timelineSlotCount) * 100
                        }
                        x2={
                          currentPly <= chartStartPly
                            ? 0
                            : ((currentPly - chartStartPly + 1) / 2 / timelineSlotCount) * 100
                        }
                        y1="0"
                        y2="100"
                      />
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
                                onMouseEnter={(event) => showClockTooltip(ply, event.currentTarget)}
                                onMouseLeave={hideClockTooltip}
                                onFocus={(event) => showClockTooltip(ply, event.currentTarget)}
                                onBlur={hideClockTooltip}
                                onClick={() => onNavigatePly(ply)}
                              />
                            );
                          })}
                          <span>{moveNumber}</span>
                        </div>
                      ))}
                    </div>
                    {hoveredPly !== null &&
                    hoveredTooltipX !== null &&
                    hoveredDuration !== null &&
                    hoveredClock !== null ? (
                      <div
                        className={`gameClockTooltip ${hoveredClockY >= 50 ? "above" : "below"}`}
                        style={
                          {
                            "--tooltip-x": `${hoveredTooltipX}px`,
                            "--tooltip-y": `${hoveredClockY}%`,
                          } as CSSProperties
                        }
                        role="tooltip"
                      >
                        <strong>
                          {`${Math.ceil(hoveredPly / 2)}.${hoveredColor === "black" ? ".." : ""} ${moves[hoveredPly - 1] ?? "Move"}`}
                        </strong>
                        <span>{formatMoveTimeForChart(hoveredDuration)}</span>
                        <span>Clock: {formatClockForChart(hoveredClock)}</span>
                      </div>
                    ) : null}
                    <span className="gameClockDuration">
                      Duration {formatGameDuration(gameDuration)}
                    </span>
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
            <p className="gameUnderboardState">No per-move clock data is stored for this game.</p>
          )
        ) : null}

        <div hidden={activeTab !== "crosstable"}>
          <GameMatchCrosstable game={game} embedded />
        </div>

        {activeTab === "share" ? (
          <div className="gameSharePanel">
            <div className="gameShareActions">
              {game.source === "chesscom" ? (
                <a
                  className="gameShareSourceLink gameShareChessComLink"
                  href={buildChessComGameUrl(game.game_id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View on Chess.com"
                  title="View on Chess.com"
                >
                  <ChessComProfileIcon />
                </a>
              ) : null}
              {game.source !== "chesscom" && game.source !== "pychess" ? (
                <a
                  className="gameShareSourceLink gameShareLichessLink"
                  href={buildLichessGameUrl(game.game_id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="View on Lichess"
                  title="View on Lichess"
                >
                  <LichessProfileIcon />
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
              {game.external_match_id ? (
                <Link
                  to="/match/$matchId"
                  params={{ matchId: game.external_match_id }}
                  aria-label="View match"
                >
                  View match
                </Link>
              ) : null}
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
            <ShareDocumentField label="FEN" rows={1} field={document.fen} />
            <ShareDocumentField label="PGN" rows={4} field={document.pgn} />
          </div>
        ) : null}
      </div>
    </section>
  );
};
