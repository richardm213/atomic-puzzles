export type PuzzleSolutionField = "solution" | "moves" | "line" | "pgn" | "variation";

export type RawPuzzleSetRow = {
  id: string | number;
  event_name: string;
  event_date: string;
  players: string[];
  source_id?: string | null;
};

export type RawPuzzleRow = {
  id?: string | number | null;
  fen?: string | null;
  explanation?: string | null;
  tags?: string[] | null;
  solution?: string | string[] | null;
  moves?: string | string[] | null;
  line?: string | string[] | null;
  pgn?: string | string[] | null;
  variation?: string | string[] | null;
  puzzle_set_id?: string | number | null;
  puzzle_set?: RawPuzzleSetRow | RawPuzzleSetRow[] | null;
  white_player?: string | null;
  black_player?: string | null;
  opa_style?: boolean | null;
  [key: string]: unknown;
};
