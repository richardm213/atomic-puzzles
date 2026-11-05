const ATOMIC_TABLEBASE_MAX_PIECES = 5;

export const isAtomicTablebasePosition = (fen: string): boolean => {
  const board = fen.trim().split(/\s+/, 1)[0] ?? "";
  const pieces = board.match(/[prnbqk]/gi)?.length ?? 0;
  return pieces > 0 && pieces <= ATOMIC_TABLEBASE_MAX_PIECES;
};
