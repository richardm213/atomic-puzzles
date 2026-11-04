import type { PlaybackCommand } from "../../types/chessboard";
import { AnalysisMoveTree } from "../AnalysisMoveTree/AnalysisMoveTree";
import { PlayedMoves } from "../PlayedMoves/PlayedMoves";

export const MoveNotation = ({
  lines,
  moves,
  currentPly,
  pinnedLineIndex,
  inline,
  onNavigate,
  onSelectVariation,
  onCycleOptions,
  onAnnotate,
}: {
  lines: string[][];
  moves: string[];
  currentPly: number;
  pinnedLineIndex?: number | undefined;
  inline: boolean;
  onNavigate: (ply: number) => void;
  onSelectVariation: (lineIndex: number, moveIndex: number) => void;
  onCycleOptions: (command: Extract<PlaybackCommand, "previousOption" | "nextOption">) => void;
  onAnnotate?:
    ((lineIndex: number | undefined, moveIndex: number, annotation: string) => void) | undefined;
}) => {
  if (lines.length <= 1) {
    const mainline = lines[0] ?? moves;
    return (
      <PlayedMoves
        moves={mainline}
        currentPly={currentPly}
        onNavigate={lines.length ? (ply) => onSelectVariation(0, Math.max(0, ply - 1)) : onNavigate}
        onAnnotate={
          onAnnotate
            ? (moveIndex, annotation) =>
                onAnnotate(lines.length ? 0 : undefined, moveIndex, annotation)
            : undefined
        }
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
      onAnnotate={
        onAnnotate
          ? (lineIndex, moveIndex, annotation) => onAnnotate(lineIndex, moveIndex, annotation)
          : undefined
      }
    />
  );
};
