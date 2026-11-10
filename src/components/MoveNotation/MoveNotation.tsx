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
  initialPly = previousMove ? previousMove.ply + 1 : 0,
  inline,
  onNavigate,
  onSelectVariation,
  onCycleOptions,
  onAnnotate,
  onDelete,
  assessments,
}: {
  lines: string[][];
  moves: string[];
  currentPly: number;
  pinnedLineIndex?: number | undefined;
  initialPly?: number | undefined;
  previousMove?: PreviousMove | undefined;
  inline: boolean;
  onNavigate: (ply: number) => void;
  onSelectVariation: (lineIndex: number, moveIndex: number) => void;
  onCycleOptions?:
    ((command: Extract<PlaybackCommand, "previousOption" | "nextOption">) => void) | undefined;
  onAnnotate?:
    ((lineIndex: number | undefined, moveIndex: number, annotation: string) => void) | undefined;
  onDelete?: ((lineIndex: number, moveIndex: number) => void) | undefined;
  assessments?: GameMoveAssessment[] | undefined;
}) => {
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
      inline={inline}
      onSelect={(lineIndex, moveIndex) => {
        if (lines.length) onSelectVariation(lineIndex, moveIndex);
        else onNavigate(moveIndex + 1);
      }}
      onCycleOptions={onCycleOptions}
      assessments={assessments}
      onDelete={onDelete}
      onAnnotate={
        onAnnotate
          ? (lineIndex, moveIndex, annotation) => onAnnotate(lineIndex, moveIndex, annotation)
          : undefined
      }
    />
  );
};
