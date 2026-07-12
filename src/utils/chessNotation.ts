import { makeSan } from "chessops/san";

import { createAtomicPosition, moveFromUci } from "../lib/puzzles/solutionPgn";

export const sanFromUci = (fen: string, uci: string): string => {
  try {
    const position = createAtomicPosition(fen);
    const move = moveFromUci(position, uci);
    return move ? makeSan(position, move) : uci;
  } catch {
    return uci;
  }
};
