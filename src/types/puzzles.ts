export type PuzzleSolutionField = "solution" | "moves" | "line" | "pgn" | "variation";

export type RawPuzzleSetRow = {
  id: string | number;
  event_name: string;
  event_date: string;
  players: string[];
  source_id?: string | null;
};

export type RawPuzzleSetMembershipRow = {
  puzzle_set_id?: string | number | null;
  puzzle_set?: RawPuzzleSetRow | RawPuzzleSetRow[] | null;
};

export type RawPuzzleRatingRow = {
  rating?: number | null;
  rating_deviation?: number | null;
  attempts?: number | null;
  successes?: number | null;
  computed_level?: number | null;
  human_level?: number | null;
  human_rated_by?: string | null;
  human_rated_at?: string | null;
  updated_at?: string | null;
};

export type RawPuzzleRow = {
  id?: string | number | null;
  created_at?: string | null;
  fen?: string | null;
  explanation?: string | null;
  tags?: string[] | null;
  solution?: string | string[] | null;
  moves?: string | string[] | null;
  line?: string | string[] | null;
  pgn?: string | string[] | null;
  variation?: string | string[] | null;
  players?: string[] | null;
  puzzle_set_id?: string | number | null;
  puzzle_set?: RawPuzzleSetRow | RawPuzzleSetRow[] | null;
  puzzle_set_memberships?: RawPuzzleSetMembershipRow[] | null;
  white_player?: string | null;
  black_player?: string | null;
  game_id?: string | number | null;
  opa_style?: boolean | null;
  rating_state?: RawPuzzleRatingRow | RawPuzzleRatingRow[] | null;
  [key: string]: unknown;
};
