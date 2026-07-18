export type MaterialCount = {
  white: number;
  black: number;
  advantage: "white" | "black" | null;
  difference: number;
  whitePieces: MaterialPieceRole[];
  blackPieces: MaterialPieceRole[];
};

export type MaterialPieceRole = "pawn" | "knight" | "bishop" | "rook" | "queen";

const PIECE_VALUES: Readonly<Record<MaterialPieceRole, number>> = {
  pawn: 1,
  knight: 3,
  bishop: 3,
  rook: 5,
  queen: 9,
};

const ROLE_BY_SYMBOL: Readonly<Record<string, MaterialPieceRole>> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
};

const ROLES_BY_VALUE: MaterialPieceRole[] = ["queen", "rook", "bishop", "knight", "pawn"];

export const materialCountFromFen = (fen: string | null | undefined): MaterialCount => {
  const board = fen?.trim().split(/\s+/)[0] ?? "";
  let white = 0;
  let black = 0;
  const whitePieceCounts = new Map<MaterialPieceRole, number>();
  const blackPieceCounts = new Map<MaterialPieceRole, number>();

  for (const piece of board) {
    const role = ROLE_BY_SYMBOL[piece.toLowerCase()];
    if (!role) continue;

    const value = PIECE_VALUES[role];
    const counts = piece === piece.toUpperCase() ? whitePieceCounts : blackPieceCounts;
    counts.set(role, (counts.get(role) ?? 0) + 1);
    if (piece === piece.toUpperCase()) white += value;
    else black += value;
  }

  const whitePieces: MaterialPieceRole[] = [];
  const blackPieces: MaterialPieceRole[] = [];
  for (const role of ROLES_BY_VALUE) {
    const countDifference = (whitePieceCounts.get(role) ?? 0) - (blackPieceCounts.get(role) ?? 0);
    const pieces = countDifference > 0 ? whitePieces : blackPieces;
    for (let index = 0; index < Math.abs(countDifference); index += 1) pieces.push(role);
  }

  const signedDifference = white - black;
  return {
    white,
    black,
    advantage: signedDifference > 0 ? "white" : signedDifference < 0 ? "black" : null,
    difference: Math.abs(signedDifference),
    whitePieces,
    blackPieces,
  };
};
