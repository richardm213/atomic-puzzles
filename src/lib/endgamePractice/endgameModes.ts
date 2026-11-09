export const endgameModes = [
  "pawn-duel",
  "blockade",
  "two-queens",
  "rook-vs-pawn",
  "rook-bishop-vs-king",
  "rook-pawn-vs-king",
  "rook-pawn-vs-pawn",
] as const;

export type EndgameMode = (typeof endgameModes)[number];

export const parseEndgameMode = (value: unknown): EndgameMode =>
  endgameModes.find((mode) => mode === value) ?? "pawn-duel";
