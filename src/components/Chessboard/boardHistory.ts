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

export const historyMoveKeys = (history: BoardHistory, end = history.index): string[] =>
  history.plies.slice(1, end + 1).flatMap((ply) => (ply.key ? [ply.key] : []));

export const historyMoveSans = (history: BoardHistory): string[] =>
  history.plies.slice(1).flatMap((ply) => (ply.san ? [ply.san] : []));
