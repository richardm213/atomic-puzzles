import { makeSan } from "chessops/san";

import { createAtomicPosition, moveFromUci } from "../lib/puzzles/solutionPgn";

export { fenAfterAtomicMove as fenAfterUciMove } from "../../shared/domain/puzzles/solutionPgn";

export const orientationFromFen = (fen: string | null | undefined): "white" | "black" =>
  fen?.trim().split(/\s+/)[1] === "b" ? "black" : "white";

export const threatFenFromFen = (fen: string): string | null => {
  try {
    if (createAtomicPosition(fen).isCheck()) return null;
  } catch {
    return null;
  }

  const fields = fen.trim().split(/\s+/);
  if (fields.length !== 6) return null;
  const [board, turn, castling, , halfmoveText, fullmoveText] = fields;
  if (!board || (turn !== "w" && turn !== "b") || !castling) return null;

  const halfmove = Number.parseInt(halfmoveText ?? "", 10);
  const fullmove = Number.parseInt(fullmoveText ?? "", 10);
  if (!Number.isInteger(halfmove) || !Number.isInteger(fullmove)) return null;

  return [
    board,
    turn === "w" ? "b" : "w",
    castling,
    "-",
    halfmove + 1,
    turn === "b" ? fullmove + 1 : fullmove,
  ].join(" ");
};

export const sanFromUci = (fen: string, uci: string): string => {
  try {
    const position = createAtomicPosition(fen);
    const move = moveFromUci(position, uci);
    return move ? makeSan(position, move) : uci;
  } catch {
    return uci;
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
