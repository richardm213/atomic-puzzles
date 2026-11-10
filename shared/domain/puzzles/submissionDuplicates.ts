import { parseFen } from "chessops/fen";

export const DIFFERENT_START_MOVE_CONFIRMATION =
  "This FEN already exists with a different starting move. Continue with this submission?";

// The position is determined by the first four FEN fields; the counters are not part of it.
export const startingFenKey = (fen: string): string | null => {
  const fields = fen.trim().split(/\s+/);
  if (
    fields.length < 4 ||
    fields.length > 6 ||
    fields.slice(4).some((field) => !/^\d+$/.test(field))
  ) {
    return null;
  }
  const position = fields.slice(0, 4).join(" ");
  return parseFen(position).isOk ? position : null;
};
