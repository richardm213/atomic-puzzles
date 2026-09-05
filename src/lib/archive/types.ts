export type ArchiveMode = "hyperbullet" | "bullet" | "blitz" | "wolfrandom" | "atomic960";

export type ArchiveMatchSource = "lobby" | "arena" | "friend" | "swiss" | "chesscom" | "unknown";

export type MatchRow = {
  match_id: string;
  player_1: string;
  player_2: string;
  start_ts: number;
  time_control: string;
  source: ArchiveMatchSource;
  tournament_id: string | null;
  games: string[];
  p1_before_rating: number | null;
  p1_after_rating: number | null;
  p1_before_rd: number | null;
  p1_after_rd: number | null;
  p2_before_rating: number | null;
  p2_after_rating: number | null;
  p2_before_rd: number | null;
  p2_after_rd: number | null;
};

export type LeaderboardRow = {
  username: string;
  month: string;
  rank: number;
  rating: number | null;
  rd: number | null;
  games: number | null;
  tc: ArchiveMode;
};

export type LeaderboardPlayerCountRow = {
  month_value: string;
  mode: string;
  player_count: number;
};

export type PlayerRatingRow = {
  username: string;
  rating: number | null;
  peak: number | null;
  peak_date: string | null;
  rd: number | null;
  games: number | null;
  tc: ArchiveMode;
  rank: number | null;
  top20_wins: string | null;
};

export type AliasRow = {
  alias: string;
  username: string;
  banned: boolean;
  count_games: "y" | "n" | "c" | "o";
  openings: string;
};
