import type { ChessboardState } from "../../types/chessboard";

export const getBoardMoveState = (boardState: ChessboardState | null, fallbackFen: string) => {
  const moveList = boardState?.lineMoves ?? [];
  const customLines = boardState?.customLines ?? [];
  const currentPly = boardState?.lineIndex ?? 0;

  return {
    currentFen: boardState?.fen || fallbackFen,
    currentPly,
    moveList,
    customLines,
    terminalOutcome: boardState?.winner ?? (boardState?.status === "Draw" ? "draw" : null),
    canStepBack: currentPly > 0,
    canStepForward: currentPly < moveList.length,
  } as const;
};
