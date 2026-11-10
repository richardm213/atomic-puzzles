import "../../features/analysisWorkspace/AnalysisWorkspace.css";

import { faFlag } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type CSSProperties, useEffect, useLayoutEffect, useState } from "react";

import type { PuzzleIntro } from "../../../shared/domain/puzzles/gameHistory";
import { MoveNotation } from "../../components/MoveNotation/MoveNotation";
import { PlaybackButtons } from "../../components/PlaybackButtons/PlaybackButtons";
import { AtomicDbAnalysisBlock } from "../../features/analysisWorkspace/AtomicDbAnalysisBlock";
import { useAtomicDbBoardAnalysis } from "../../hooks/useAtomicDbBoardAnalysis";
import type { AtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
import { startingPlyFromFen } from "../../lib/chess/pgn";
import type { PlaybackCommand } from "../../types/chessboard";

const initialEngineSettings = (): AtomicDbEngineSettings => ({
  enabled: false,
  atomicDbEnabled: true,
  lineCount: 3,
  showFollowUpMoves: true,
  settingsVersion: 2,
});

export const PuzzleAnalysisPanel = ({
  fen,
  analysisActive,
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
  canStepBack,
  canStepForward,
  onNavigateMoves,
}: {
  fen: string;
  analysisActive: boolean;
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
  canStepBack: boolean;
  canStepForward: boolean;
  onNavigateMoves: (
    command: Extract<PlaybackCommand, "start" | "previous" | "next" | "end">,
  ) => void;
}) => {
  const [engineSettings, setEngineSettings] = useState(initialEngineSettings);

  useEffect(() => {
    setEngineSettings(initialEngineSettings());
    onHoverMove(null);
  }, [onHoverMove]);

  const { analysis, engineMoves } = useAtomicDbBoardAnalysis({
    currentFen: fen,
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
            fen={fen}
            analysis={analysis}
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
        />
        <div
          className={`puzzleMoveToolbar ${canGiveUp ? "hasGiveUp" : ""}`.trim()}
          aria-label="Move navigation"
        >
          {canGiveUp ? (
            <button
              type="button"
              className="analysisToolbarButton puzzleGiveUpButton"
              aria-label="Give up and reveal the solution"
              title="Give up and reveal the solution"
              onClick={onGiveUp}
            >
              <FontAwesomeIcon icon={faFlag} aria-hidden="true" />
            </button>
          ) : null}
          <PlaybackButtons
            buttonClassName="analysisToolbarButton"
            canStart={canStepBack}
            canPrevious={canStepBack}
            canNext={canStepForward}
            canEnd={canStepForward}
            onNavigate={onNavigateMoves}
          />
        </div>
      </div>
    </section>
  );
};
