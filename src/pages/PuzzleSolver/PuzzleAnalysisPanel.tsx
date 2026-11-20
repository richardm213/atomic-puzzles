import "../../features/analysisWorkspace/AnalysisWorkspace.css";

import { faFlag } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect } from "react";

import type { PuzzleIntro } from "../../../shared/domain/puzzles/gameHistory";
import { MoveNotation } from "../../components/MoveNotation/MoveNotation";
import { PlaybackButtons } from "../../components/PlaybackButtons/PlaybackButtons";
import { AtomicDbAnalysisBlock } from "../../features/analysisWorkspace/AtomicDbAnalysisBlock";
import { useAtomicDbBoardAnalysis } from "../../hooks/useAtomicDbBoardAnalysis";
import { useAtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
import type { useBoardMoveEditing } from "../../hooks/useBoardMoveEditing";
import { startingPlyFromFen } from "../../lib/chess/pgn";
import type { PlaybackAvailability, PlaybackCommand } from "../../types/chessboard";

export const PuzzleAnalysisPanel = ({
  initialFen,
  currentFen,
  analysisActive,
  analysisActions,
  moveEditing,
  previousMove,
  beforePreviousMove,
  terminalOutcome,
  lines,
  moves,
  currentPly,
  activeLineIndex,
  onNavigate,
  onSelectVariation,
  onCycleOptions,
  onPlayLine,
  onHoverMove,
  onEngineMovesChange,
  canGiveUp,
  onGiveUp,
  resignArmed,
  playback,
  onNavigateMoves,
}: {
  initialFen: string;
  currentFen: string;
  analysisActive: boolean;
  analysisActions?: ReactNode;
  moveEditing: ReturnType<typeof useBoardMoveEditing>;
  previousMove?: PuzzleIntro | null | undefined;
  beforePreviousMove?: boolean | undefined;
  terminalOutcome: "white" | "black" | "draw" | null;
  lines: string[][];
  moves: string[];
  currentPly: number;
  activeLineIndex: number;
  onNavigate: (ply: number) => void;
  onSelectVariation: (lineIndex: number, moveIndex: number) => void;
  onCycleOptions: (command: Extract<PlaybackCommand, "previousOption" | "nextOption">) => void;
  onPlayLine: (ucis: string[]) => void;
  onHoverMove: (uci: string | null) => void;
  onEngineMovesChange: (moves: readonly string[] | null) => void;
  canGiveUp: boolean;
  onGiveUp: () => void;
  resignArmed?: boolean;
  playback: PlaybackAvailability | undefined;
  onNavigateMoves: (
    command: Extract<PlaybackCommand, "start" | "previous" | "next" | "end">,
  ) => void;
}) => {
  const [engineSettings, setEngineSettings] = useAtomicDbEngineSettings({
    storageKey: "atomic-puzzles.puzzle-engine",
    defaultEnabled: false,
  });

  useEffect(() => {
    setEngineSettings((current) => ({ ...current, enabled: false }));
    onHoverMove(null);
  }, [onHoverMove, setEngineSettings]);

  const { panelProps, engineMoves } = useAtomicDbBoardAnalysis({
    currentFen,
    enabled: analysisActive && engineSettings.enabled,
    atomicDbEnabled: engineSettings.atomicDbEnabled !== false,
    navigation: null,
    lineCount: engineSettings.lineCount,
    showFollowUpMoves: engineSettings.showFollowUpMoves,
    terminalOutcome,
  });

  useLayoutEffect(() => {
    onEngineMovesChange(engineMoves);
    return () => onEngineMovesChange(null);
  }, [engineMoves, onEngineMovesChange]);

  return (
    <section
      className={`puzzleAnalysisPanel ${analysisActive ? "analysisActive" : ""}`.trim()}
      style={{ "--puzzle-engine-line-count": engineSettings.lineCount } as CSSProperties}
      aria-label="Puzzle analysis"
    >
      {analysisActive ? (
        <div className="puzzleAnalysisEngine">
          <AtomicDbAnalysisBlock
            {...panelProps}
            beforeSettings={analysisActions}
            settings={engineSettings}
            setSettings={setEngineSettings}
            notationInline
            onDisable={() => onHoverMove(null)}
            onHoverMove={onHoverMove}
            onPlayLine={onPlayLine}
          />
        </div>
      ) : null}

      <div className="puzzleAnalysisMoves" aria-label="Played moves">
        <MoveNotation
          reserveFirstRow
          initialFen={initialFen}
          lines={analysisActive ? lines : []}
          moves={moves}
          previousMove={
            previousMove
              ? { san: previousMove.san, ply: startingPlyFromFen(previousMove.beforeFen) }
              : undefined
          }
          beforePreviousMove={beforePreviousMove}
          currentPly={currentPly}
          pinnedLineIndex={activeLineIndex}
          inline
          onNavigate={onNavigate}
          onSelectVariation={onSelectVariation}
          onCycleOptions={onCycleOptions}
          {...moveEditing}
        />
        <div
          className={`puzzleMoveToolbar ${canGiveUp ? "hasGiveUp" : ""}`.trim()}
          aria-label="Move navigation"
        >
          {canGiveUp ? (
            <button
              type="button"
              className={`analysisToolbarButton puzzleGiveUpButton${resignArmed ? " isArmed" : ""}`}
              aria-label={resignArmed ? "Confirm resignation" : "Resign and reveal the solution"}
              title={resignArmed ? "Confirm resignation" : "Resign and reveal the solution"}
              aria-pressed={Boolean(resignArmed)}
              onClick={onGiveUp}
            >
              <FontAwesomeIcon icon={faFlag} aria-hidden="true" />
            </button>
          ) : null}
          <PlaybackButtons
            buttonClassName="analysisToolbarButton"
            canStart={Boolean(playback?.start)}
            canPrevious={Boolean(playback?.previous)}
            canNext={Boolean(playback?.next)}
            canEnd={Boolean(playback?.end)}
            onNavigate={onNavigateMoves}
          />
        </div>
      </div>
    </section>
  );
};
