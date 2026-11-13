import type { GameMoveAssessment } from "../../lib/gameAnalysis/gameAnalysis";
import type { PlaybackCommand } from "../../types/chessboard";
import { AnalysisMoveTree, type PreviousMove } from "../AnalysisMoveTree/AnalysisMoveTree";
import { PlayedMoves } from "../PlayedMoves/PlayedMoves";

export const MoveNotation = ({
  lines,
  moves,
  currentPly,
  pinnedLineIndex,
  previousMove,
  beforePreviousMove,
  reserveFirstRow = false,
  initialPly = previousMove ? previousMove.ply + 1 : 0,
  inline,
  onNavigate,
  onSelectVariation,
  onCycleOptions,
  onAnnotate,
  onDelete,
  assessments,
  initialFen,
}: {
  lines: string[][];
  moves: string[];
  currentPly: number;
  pinnedLineIndex?: number | undefined;
  initialPly?: number | undefined;
  previousMove?: PreviousMove | undefined;
  beforePreviousMove?: boolean | undefined;
  reserveFirstRow?: boolean;
  inline: boolean;
  onNavigate: (ply: number) => void;
  onSelectVariation: (lineIndex: number, moveIndex: number) => void;
  onCycleOptions?:
    ((command: Extract<PlaybackCommand, "previousOption" | "nextOption">) => void) | undefined;
  onAnnotate?:
    ((lineIndex: number | undefined, moveIndex: number, annotation: string) => void) | undefined;
  onDelete?: ((lineIndex: number, moveIndex: number) => void) | undefined;
  assessments?: GameMoveAssessment[] | undefined;
  initialFen?: string | undefined;
}) => {
  if (reserveFirstRow && !lines.length && !moves.length && !previousMove) {
    return <div className="analysisTree" aria-hidden="true" />;
  }

  if (!inline && !previousMove && lines.length <= 1 && initialPly === 0) {
    const mainline = lines[0] ?? moves;
    return (
      <PlayedMoves
        moves={mainline}
        currentPly={currentPly}
        assessments={assessments}
        onNavigate={lines.length ? (ply) => onSelectVariation(0, Math.max(0, ply - 1)) : onNavigate}
        onAnnotate={
          onAnnotate
            ? (moveIndex, annotation) =>
                onAnnotate(lines.length ? 0 : undefined, moveIndex, annotation)
            : undefined
        }
        onDelete={onDelete ? (moveIndex) => onDelete(0, moveIndex) : undefined}
      />
    );
  }

  const displayedLines = lines.length ? lines : moves.length ? [moves] : [];

  return (
    <AnalysisMoveTree
      lines={displayedLines}
      moves={moves}
      currentPly={currentPly}
      pinnedLineIndex={pinnedLineIndex}
      initialPly={initialPly}
      previousMove={previousMove}
      beforePreviousMove={beforePreviousMove}
      onSelectPreviousMove={() => onNavigate(0)}
      inline={inline}
      onSelect={(lineIndex, moveIndex) => {
        if (lines.length) onSelectVariation(lineIndex, moveIndex);
        else onNavigate(moveIndex + 1);
      }}
      onCycleOptions={onCycleOptions}
      assessments={assessments}
      initialFen={initialFen}
      onDelete={onDelete}
      onAnnotate={onAnnotate}
    />
  );
};
