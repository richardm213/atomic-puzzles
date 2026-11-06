import "../../features/analysisWorkspace/AnalysisWorkspace.css";

import { type CSSProperties, useEffect, useState } from "react";

import { MoveNotation } from "../../components/MoveNotation/MoveNotation";
import { AtomicDbAnalysisBlock } from "../../features/analysisWorkspace/AtomicDbAnalysisBlock";
import { useAtomicDbAnalysis } from "../../hooks/useAtomicDbAnalysis";
import type { AtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
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
  attempted,
  lines,
  moves,
  currentPly,
  activeLineIndex,
  onNavigate,
  onSelectVariation,
  onCycleOptions,
  onPlayLine,
  onHoverMove,
}: {
  fen: string;
  attempted: boolean;
  lines: string[][];
  moves: string[];
  currentPly: number;
  activeLineIndex: number;
  onNavigate: (ply: number) => void;
  onSelectVariation: (lineIndex: number, moveIndex: number) => void;
  onCycleOptions: (command: Extract<PlaybackCommand, "previousOption" | "nextOption">) => void;
  onPlayLine: (ucis: string[]) => void;
  onHoverMove: (uci: string | null) => void;
}) => {
  const [engineSettings, setEngineSettings] = useState(initialEngineSettings);

  useEffect(() => {
    setEngineSettings(initialEngineSettings());
    onHoverMove(null);
  }, [onHoverMove]);

  const analysis = useAtomicDbAnalysis(fen, {
    enabled: attempted && engineSettings.enabled,
    atomicDbEnabled: engineSettings.atomicDbEnabled !== false,
    fallbackToEngine: true,
    lineCount: engineSettings.lineCount,
    plyCount: engineSettings.showFollowUpMoves ? 5 : 1,
  });

  return (
    <section
      className={`puzzleAnalysisPanel ${attempted ? "attempted" : ""}`.trim()}
      style={{ "--puzzle-engine-line-count": engineSettings.lineCount } as CSSProperties}
      aria-label="Puzzle analysis"
    >
      <div className="puzzleAnalysisEngine">
        {attempted ? (
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
        ) : (
          <div className="puzzleAnalysisLocked" aria-hidden="true" />
        )}
      </div>

      <div className="puzzleAnalysisMoves" aria-label="Played moves">
        <MoveNotation
          lines={attempted ? lines : []}
          moves={moves}
          currentPly={currentPly}
          pinnedLineIndex={activeLineIndex}
          inline
          onNavigate={onNavigate}
          onSelectVariation={onSelectVariation}
          onCycleOptions={onCycleOptions}
        />
      </div>
    </section>
  );
};
