import type { RawPuzzleRow } from "../../types/puzzles";

export type PuzzleProgressRow = {
  puzzle_id: string;
  first_attempt_at: string;
  puzzle_correct: boolean;
  incorrect_move: string | null;
  correct_move?: string | null;
};

export type PuzzleProgressWithUsernameRow = PuzzleProgressRow & {
  user_id?: number;
  username: string;
};

export type PuzzleProgressRpcRow = {
  puzzle_id?: string | number | null;
  first_attempt_at?: string | null;
  puzzle_correct?: boolean | null;
  incorrect_move?: string | null;
  correct_move?: string | null;
  total_count?: number | null;
};

export type AttemptedPuzzleIdRow = {
  puzzle_id?: string | number | null;
};

export type SupabaseUser = {
  id: number;
  username: string;
  created_at: string;
};

export type PuzzleUserRatingRow = {
  user_id: number;
  username: string;
  rating: number;
  rating_deviation: number;
  attempts: number;
  successes: number;
  updated_at: string | null;
  last_attempt_at: string | null;
};

export type PuzzleRatingEventRow = {
  id: number;
  user_id: number;
  username: string;
  puzzle_id: number;
  attempted_at: string;
  puzzle_correct: boolean;
  user_rating_before: number;
  user_rating_after: number;
  user_rd_before: number;
  user_rd_after: number;
  puzzle_rating_before: number;
  puzzle_rating_after: number;
  puzzle_rd_before: number;
  puzzle_rd_after: number;
  calculation_kind: "historical_backfill" | "historical_user_backfill" | "live_glicko";
  created_at: string;
};

export type PuzzleQueueRow = {
  id: number;
  fen: string;
  solution: string;
  event: string;
  event_name: string;
  event_date: string;
  players: string[];
  white_player: string;
  black_player: string;
  explanation: string;
  opa_style: boolean;
  submitted_by: string;
  created_at: string;
};

export type PuzzleReviewQueueRow = PuzzleQueueRow & {
  next_puzzle_id: number;
};

export type PuzzleVoteRow = {
  puzzle_id: number;
  username: string;
  vote: -1 | 1;
  created_at: string;
  updated_at: string;
};

export type CommunityCommentRow = {
  id: number;
  target_type: "puzzle" | "profile" | "match";
  target_id: string;
  target_context: string;
  username: string;
  parent_id: number | null;
  body: string;
  created_at: string;
};

export type CommunityCommentVoteRow = {
  comment_id: number;
  username: string;
  vote: -1 | 1;
  created_at: string;
  updated_at: string;
};

export type NotificationRow = {
  id: number;
  recipient_username: string;
  actor_username: string | null;
  notification_type:
    | "puzzle_comment"
    | "comment_reply"
    | "puzzle_approved"
    | "puzzle_rating_added"
    | "shop_redemption"
    | "coin_gift"
    | "coin_request"
    | "monthly_ranking";
  puzzle_id: number | null;
  comment_id: number | null;
  rating: number | null;
  rating_deviation: number | null;
  shop_item_key: string | null;
  redemption_id: number | null;
  coin_amount: number | null;
  coin_message: string | null;
  coin_transfer_id: number | null;
  coin_request_id: number | null;
  ranking_period: string | null;
  ranking_mode: "blitz" | "bullet" | "hyperbullet" | null;
  ranking_position: number | null;
  created_at: string;
  read_at: string | null;
};

export type PuzzleIssueRow = {
  id: number;
  puzzle_id: number;
  reporter_username: string;
  category: "missing_alternate_solution" | "incorrect_solution" | "other";
  details: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
};

type TableDef<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type AtomicArenaRow = {
  arena_id: string;
  name: string;
  frequency: "monthly" | "shield" | "yearly";
  category: string;
  starts_at: string;
  url: string;
  winner: string;
  second_place: string | null;
  third_place: string | null;
  score: number;
  winner_rating: number | null;
  winner_performance: number | null;
  time_control: string;
  minutes: number;
  players: number;
};

export type TournamentArchiveRow = {
  tournament_id: string;
  payload: unknown;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      lichess_atomic_arenas: TableDef<AtomicArenaRow, never, never>;
      tournament_archives: TableDef<TournamentArchiveRow, never, never>;
      puzzle_progress: TableDef<
        PuzzleProgressWithUsernameRow,
        PuzzleProgressWithUsernameRow,
        Partial<PuzzleProgressWithUsernameRow>
      >;
      puzzle_user_ratings: TableDef<PuzzleUserRatingRow, never, never>;
      puzzle_rating_events: TableDef<PuzzleRatingEventRow, never, never>;
      puzzles: TableDef<RawPuzzleRow>;
      puzzles_queue: TableDef<
        PuzzleQueueRow,
        Pick<
          PuzzleQueueRow,
          | "fen"
          | "solution"
          | "event"
          | "event_name"
          | "event_date"
          | "players"
          | "white_player"
          | "black_player"
          | "explanation"
          | "opa_style"
          | "submitted_by"
        >,
        Partial<PuzzleQueueRow>
      >;
      puzzle_votes: TableDef<
        PuzzleVoteRow,
        Pick<PuzzleVoteRow, "puzzle_id" | "username" | "vote">,
        Pick<PuzzleVoteRow, "vote">
      >;
      community_comments: TableDef<
        CommunityCommentRow,
        Pick<
          CommunityCommentRow,
          "target_type" | "target_id" | "target_context" | "username" | "parent_id" | "body"
        >,
        never
      >;
      community_comment_votes: TableDef<
        CommunityCommentVoteRow,
        Pick<CommunityCommentVoteRow, "comment_id" | "username" | "vote">,
        Pick<CommunityCommentVoteRow, "vote">
      >;
      notifications: TableDef<NotificationRow, never, Pick<NotificationRow, "read_at">>;
      puzzle_issues: TableDef<
        PuzzleIssueRow,
        Pick<PuzzleIssueRow, "puzzle_id" | "reporter_username" | "category" | "details">,
        Pick<PuzzleIssueRow, "status" | "updated_at" | "resolved_at" | "resolved_by">
      >;
      users: TableDef<
        { id: number; username: string; created_at: string | null },
        { username: string }
      >;
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
