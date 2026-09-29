import { makeFen } from "chessops/fen";
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

export const fenAfterUciMove = (fen: string, uci: string): string | null => {
  try {
    const position = createAtomicPosition(fen);
    const move = moveFromUci(position, uci);
    if (!move || !position.isLegal(move)) return null;
    position.play(move);
    return makeFen(position.toSetup());
  } catch {
    return null;
  }
};

export const sanLineFromUci = (fen: string, moves: string[]): string[] => {
  try {
    const position = createAtomicPosition(fen);
    const sanMoves: string[] = [];
    for (const uci of moves) {
      const move = moveFromUci(position, uci);
      if (!move || !position.isLegal(move)) break;
      sanMoves.push(makeSan(position, move));
      position.play(move);
    }
    return sanMoves;
  } catch {
    return [];
  }
};

export type SanLineToken =
  { type: "moveNumber"; value: string } | { type: "move"; value: string; ply: number };

export const numberedSanLineFromUci = (fen: string, moves: string[]): SanLineToken[] => {
  const sanMoves = sanLineFromUci(fen, moves);
  const fields = fen.trim().split(/\s+/);
  const startsWithBlack = fields[1] === "b";
  const parsedFullmove = Number(fields[5]);
  let fullmove = Number.isInteger(parsedFullmove) && parsedFullmove > 0 ? parsedFullmove : 1;
  const tokens: SanLineToken[] = [];

  sanMoves.forEach((san, index) => {
    const isBlackMove = startsWithBlack ? index % 2 === 0 : index % 2 === 1;
    if (!isBlackMove) {
      tokens.push({ type: "moveNumber", value: `${fullmove}.` });
    } else if (index === 0) {
      tokens.push({ type: "moveNumber", value: `${fullmove}...` });
    }
    tokens.push({ type: "move", value: san, ply: index });
    if (isBlackMove) fullmove += 1;
  });

  return tokens;
};
