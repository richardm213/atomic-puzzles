import type { GameMoveAssessment } from "../../lib/gameAnalysis/gameAnalysis";
import type { PlaybackCommand } from "../../types/chessboard";
import { AnalysisMoveTree } from "../AnalysisMoveTree/AnalysisMoveTree";
import { PlayedMoves } from "../PlayedMoves/PlayedMoves";

export const MoveNotation = ({
  lines,
  moves,
  currentPly,
  pinnedLineIndex,
  inline,
  alwaysUseTree = false,
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
  inline: boolean;
  alwaysUseTree?: boolean | undefined;
  onNavigate: (ply: number) => void;
  onSelectVariation: (lineIndex: number, moveIndex: number) => void;
  onCycleOptions: (command: Extract<PlaybackCommand, "previousOption" | "nextOption">) => void;
  onAnnotate?:
    ((lineIndex: number | undefined, moveIndex: number, annotation: string) => void) | undefined;
  onDelete?: ((lineIndex: number, moveIndex: number) => void) | undefined;
  assessments?: GameMoveAssessment[] | undefined;
}) => {
  if (!alwaysUseTree && lines.length <= 1) {
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

  return (
    <AnalysisMoveTree
      lines={lines}
      moves={moves}
      currentPly={currentPly}
      pinnedLineIndex={pinnedLineIndex}
      inline={inline}
      onSelect={onSelectVariation}
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
