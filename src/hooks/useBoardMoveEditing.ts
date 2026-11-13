import { useCallback } from "react";

import { buildBoardLoadNavigation, pgnLineIndexForPrefix } from "../lib/analysis/boardLoading";
import { boardLineAnnotationNavigation } from "../lib/analysis/boardState";
import {
  formatSolutionMove,
  prunePgnLinesFromMove,
  sameSolutionMove,
  serializeSanLinesToPgn,
  splitSolutionMove,
} from "../lib/chess/pgn";
import type { BoardLineRef, SolutionNavigation } from "../types/chessboard";

const editedLineNavigation = (
  fen: string,
  lines: string[][],
  lineIndex: number,
  ply: number,
): SolutionNavigation => {
  const pgn = serializeSanLinesToPgn(fen, lines);
  return buildBoardLoadNavigation({
    fen,
    pgn,
    line: pgnLineIndexForPrefix(fen, pgn, lines[lineIndex]?.slice(0, ply) ?? []),
    ply,
  });
};

export const useBoardMoveEditing = ({
  fen,
  lines,
  lineTargets,
  onNavigate,
  disabled = false,
}: {
  fen: string;
  lines: string[][];
  lineTargets: BoardLineRef[];
  onNavigate: (navigation: SolutionNavigation) => void;
  disabled?: boolean;
}) => {
  const onAnnotate = useCallback(
    (lineIndex: number | undefined, moveIndex: number, annotation: string) => {
      const target =
        lineIndex === undefined ? { source: "history" as const } : lineTargets[lineIndex];
      if (!target) return;
      if (target.source === "solution" && lineIndex !== undefined) {
        const next = lines.map((line, index) =>
          index === lineIndex
            ? line.map((move, ply) =>
                ply === moveIndex
                  ? formatSolutionMove(splitSolutionMove(move).san, annotation)
                  : move,
              )
            : line,
        );
        onNavigate(editedLineNavigation(fen, next, lineIndex, moveIndex + 1));
        return;
      }
      const navigation = boardLineAnnotationNavigation(target, moveIndex + 1, annotation);
      if (navigation) onNavigate(navigation);
    },
    [fen, lines, lineTargets, onNavigate],
  );
  const onDelete = useCallback(
    (lineIndex: number, moveIndex: number) => {
      const pruned = prunePgnLinesFromMove(lines, lineIndex, moveIndex, sameSolutionMove);
      if (!pruned.changed) return;
      onNavigate(editedLineNavigation(fen, pruned.lines, pruned.lineIndex, pruned.ply));
    },
    [fen, lines, onNavigate],
  );
  return {
    onAnnotate: disabled ? undefined : onAnnotate,
    onDelete: disabled ? undefined : onDelete,
  };
};
