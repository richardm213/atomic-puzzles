import type { RawPuzzleRow } from "./puzzles";

export type MatchRow = {
  match_id: string;
  player_1: string;
  player_2: string;
  start_ts: number;
  time_control: string | null;
  source: string | null;
  tournament_id: string | null;
  games: unknown;
  p1_before_rating: number | null;
  p1_after_rating: number | null;
  p1_before_rd: number | null;
  p1_after_rd: number | null;
  p2_before_rating: number | null;
  p2_after_rating: number | null;
  p2_before_rd: number | null;
  p2_after_rd: number | null;
};

export type LbRow = {
  username: string;
  month: string;
  rank: number | null;
  rating: number | null;
  rd: number | null;
  games: number | null;
  tc: string | null;
};

export type PlayerRatingRow = {
  username: string;
  rating: number | null;
  peak: number | null;
  peak_date: string | null;
  rd: number | null;
  games: number | null;
  tc: string | null;
  rank: number | null;
  top20_wins: number | null;
};

export type PuzzleProgressRow = {
  puzzle_id: string;
  first_attempt_at: string;
  puzzle_correct: boolean;
  incorrect_move: string | null;
};

export type PuzzleProgressWithUsernameRow = PuzzleProgressRow & {
  username: string;
};

export type PuzzleProgressRpcRow = {
  puzzle_id?: string | number | null;
  first_attempt_at?: string | null;
  puzzle_correct?: boolean | null;
  incorrect_move?: string | null;
  total_count?: number | null;
};

export type AttemptedPuzzleIdRow = {
  puzzle_id?: string | number | null;
};

export type SupabaseUser = {
  username: string;
  created_at: string;
};

export type PuzzleQueueRow = {
  id: number;
  fen: string;
  solution: string;
  event: string;
  explanation: string;
  submitted_by: string;
  created_at: string;
};

export type PuzzleReviewQueueRow = PuzzleQueueRow & {
  next_puzzle_id: number;
};

export type Aliases2TableRow = {
  alias: string | null;
  username: string | null;
  banned: boolean | null;
  count_games: boolean | number | string | null;
  openings: string[] | string | null;
};

type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      aliases2: TableDef<Aliases2TableRow>;
      blitz_matches: TableDef<MatchRow>;
      bullet_matches: TableDef<MatchRow>;
      hyper_matches: TableDef<MatchRow>;
      wolfrandom_matches: TableDef<MatchRow>;
      lb: TableDef<LbRow>;
      player_ratings: TableDef<PlayerRatingRow>;
      puzzle_progress: TableDef<
        PuzzleProgressWithUsernameRow,
        PuzzleProgressWithUsernameRow,
        Partial<PuzzleProgressWithUsernameRow>
      >;
      puzzles: TableDef<RawPuzzleRow>;
      puzzles_queue: TableDef<
        PuzzleQueueRow,
        Pick<PuzzleQueueRow, "fen" | "solution" | "event" | "explanation" | "submitted_by">,
        Partial<Pick<PuzzleQueueRow, "fen" | "solution" | "event" | "explanation">>
      >;
      users: TableDef<{ username: string; created_at: string | null }, { username: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      get_attempted_puzzle_ids: {
        Args: { p_username: string };
        Returns: AttemptedPuzzleIdRow[];
      };
      get_puzzle_progress_page: {
        Args: { p_username: string; p_page: number; p_page_size: number };
        Returns: PuzzleProgressRpcRow[];
      };
      record_first_puzzle_attempt: {
        Args: {
          p_username: string;
          p_puzzle_id: string;
          p_puzzle_correct: boolean;
          p_incorrect_move?: string | null;
          p_first_attempt_at?: string | null;
        };
        Returns: null;
      };
      approve_queued_puzzle: {
        Args: { p_queue_id: number; p_reviewer: string };
        Returns: number;
      };
      enqueue_puzzle_submission: {
        Args: {
          p_fen: string;
          p_solution: string;
          p_event: string;
          p_explanation: string;
          p_submitted_by: string;
        };
        Returns: PuzzleQueueRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
