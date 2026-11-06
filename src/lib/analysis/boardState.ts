import type { BoardLineRef, ChessboardState, SolutionNavigation } from "../../types/chessboard";
import { sameSolutionMove } from "../chess/pgn";

export type DisplayedBoardLine = {
  moves: string[];
  target: BoardLineRef;
};

type BoardLineStateOptions = {
  activeSolutionLineIndex?: number;
};

const sameLine = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((move, index) => sameSolutionMove(move, right[index]));

const startsWithLine = (line: string[], prefix: string[]): boolean =>
  prefix.length <= line.length &&
  prefix.every((move, index) => sameSolutionMove(move, line[index]));

const inferredActiveLine = (boardState: ChessboardState | null): BoardLineRef => {
  if (boardState?.activeLine) return boardState.activeLine;
  if (boardState?.viewingSolution) {
    return { source: "solution", index: boardState.solutionLineIndex ?? 0 };
  }
  if (boardState?.customLineIndex !== undefined) {
    return { source: "custom", index: boardState.customLineIndex };
  }
  return { source: "history" };
};

export const boardLineNavigation = (target: BoardLineRef, ply: number): SolutionNavigation => {
  if (target.source === "solution") return { type: "solution", line: target.index, ply };
  if (target.source === "custom") return { type: "custom", line: target.index, ply };
  return { type: "history", ply };
};

export const boardLineAnnotationNavigation = (
  target: BoardLineRef,
  ply: number,
  annotation: string,
): SolutionNavigation | null => {
  if (target.source === "solution") return null;
  return {
    type: "annotate",
    source: target.source,
    ...(target.source === "custom" ? { line: target.index } : {}),
    ply,
    annotation,
  };
};

export const getBoardLineState = (
  boardState: ChessboardState | null,
  { activeSolutionLineIndex }: BoardLineStateOptions = {},
) => {
  const moveList = boardState?.lineMoves ?? [];
  const currentPly = Math.max(0, Math.min(boardState?.lineIndex ?? 0, moveList.length));
  const solutionLines = boardState?.solutionLines ?? [];
  const customLines = boardState?.customLines ?? [];
  const displayedLines: DisplayedBoardLine[] = [];
  const solutionDisplayIndexes: number[] = [];
  const customDisplayIndexes: number[] = [];

  const addLine = (moves: string[], target: BoardLineRef): number => {
    const existingIndex = displayedLines.findIndex((line) => sameLine(line.moves, moves));
    if (existingIndex >= 0) return existingIndex;
    displayedLines.push({ moves, target });
    return displayedLines.length - 1;
  };

  solutionLines.forEach((moves, index) => {
    solutionDisplayIndexes[index] = addLine(moves, { source: "solution", index });
  });
  customLines.forEach((moves, index) => {
    customDisplayIndexes[index] = addLine(moves, { source: "custom", index });
  });

  const matchingHistoryIndex = displayedLines.findIndex((line) =>
    startsWithLine(line.moves, moveList),
  );
  const historyDisplayIndex = moveList.length
    ? matchingHistoryIndex >= 0
      ? matchingHistoryIndex
      : addLine(moveList, { source: "history" })
    : displayedLines.length
      ? 0
      : -1;
  const activeLine =
    activeSolutionLineIndex === undefined
      ? inferredActiveLine(boardState)
      : ({ source: "solution", index: activeSolutionLineIndex } satisfies BoardLineRef);
  const activeLineIndex = (() => {
    if (activeLine.source === "solution") {
      return solutionDisplayIndexes[activeLine.index] ?? historyDisplayIndex;
    }
    if (activeLine.source === "custom") {
      return customDisplayIndexes[activeLine.index] ?? historyDisplayIndex;
    }
    return historyDisplayIndex;
  })();

  return {
    activeLine,
    activeLineIndex: Math.max(0, activeLineIndex),
    currentMoves: moveList.slice(0, currentPly),
    currentPly,
    customLines,
    displayedLines,
    lineTargets: displayedLines.map((line) => line.target),
    lines: displayedLines.map((line) => line.moves),
    moveList,
    solutionLines,
  } as const;
};

export const getBoardMoveState = (boardState: ChessboardState | null, fallbackFen: string) => {
  const lineState = getBoardLineState(boardState);

  return {
    ...lineState,
    currentFen: boardState?.fen || fallbackFen,
    terminalOutcome: boardState?.winner ?? (boardState?.status === "Draw" ? "draw" : null),
    canStepBack: lineState.currentPly > 0,
    canStepForward: lineState.currentPly < lineState.moveList.length,
  } as const;
};
