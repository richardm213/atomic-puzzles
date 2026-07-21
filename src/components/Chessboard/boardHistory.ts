import type { Key } from "@lichess-org/chessground/types";

export type HistoryPly = {
  fen: string;
  lastMove?: [Key, Key] | undefined;
  uci?: string | undefined;
  key?: string | undefined;
  san?: string | undefined;
};

export type BoardHistory = {
  plies: HistoryPly[];
  index: number;
};

export const createBoardHistory = (fen?: string): BoardHistory => ({
  plies: fen === undefined ? [] : [{ fen }],
  index: 0,
});

export const cloneBoardHistory = (history: BoardHistory): BoardHistory => ({
  plies: history.plies.map((ply) => ({ ...ply })),
  index: history.index,
});

export const assertBoardHistory = (history: BoardHistory): void => {
  if (!history.plies.length || history.index < 0 || history.index >= history.plies.length) {
    throw new Error(`Invalid board history index ${history.index}/${history.plies.length}`);
  }
};

export const appendBoardMove = (history: BoardHistory, ply: Required<HistoryPly>): void => {
  assertBoardHistory(history);
  history.plies.splice(history.index + 1);
  history.plies.push(ply);
  history.index += 1;
};

export const historyMoveKeys = (history: BoardHistory, end = history.index): string[] => {
  const keys: string[] = [];
  for (let index = 1; index <= end; index += 1) {
    const key = history.plies[index]?.key;
    if (key) keys.push(key);
  }
  return keys;
};

export const historyMoveSans = (history: BoardHistory): string[] => {
  const moves: string[] = [];
  for (let index = 1; index < history.plies.length; index += 1) {
    const san = history.plies[index]?.san;
    if (san) moves.push(san);
  }
  return moves;
};
