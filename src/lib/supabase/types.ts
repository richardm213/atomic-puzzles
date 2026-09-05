import type { RawPuzzleRow } from "../../types/puzzles";

export type PuzzleProgressRow = {
  puzzle_id: string;
  first_attempt_at: string;
  puzzle_correct: boolean;
  incorrect_move: string | null;
  correct_move?: string | null;
};

export type PuzzleProgressWithUsernameRow = PuzzleProgressRow & {
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
  notification_type: "puzzle_comment" | "comment_reply" | "puzzle_approved";
  puzzle_id: number;
  comment_id: number | null;
  created_at: string;
  read_at: string | null;
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
      puzzle_progress: TableDef<
        PuzzleProgressWithUsernameRow,
        PuzzleProgressWithUsernameRow,
        Partial<PuzzleProgressWithUsernameRow>
      >;
      puzzles: TableDef<RawPuzzleRow>;
      puzzles_queue: TableDef<
        PuzzleQueueRow,
        Pick<PuzzleQueueRow, "fen" | "solution" | "event" | "explanation" | "submitted_by">,
        Partial<Pick<PuzzleQueueRow, "fen" | "solution" | "event" | "explanation" | "submitted_by">>
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
