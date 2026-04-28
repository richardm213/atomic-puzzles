export type PuzzleSolutionField = "solution" | "moves" | "line" | "pgn" | "variation";

export type RawPuzzleRow = {
  id?: string | number | null;
  fen?: string | null;
  solution?: string | string[] | null;
  moves?: string | string[] | null;
  line?: string | string[] | null;
  pgn?: string | string[] | null;
  variation?: string | string[] | null;
  [key: string]: unknown;
};
