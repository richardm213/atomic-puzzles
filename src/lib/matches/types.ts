import type { Mode } from "../../constants/matches";

export type WinnerCode = "white" | "black" | "draw" | "w" | "b" | "d" | string;

export type RatingFields = {
  before_rating: number | null;
  after_rating: number | null;
  before_rd: number | null;
  after_rd: number | null;
};

export type RawRatingsByPlayer = Record<string, RatingFields>;

export type RawGameObject = {
  id?: string | number;
  white?: string | null;
  black?: string | null;
  winner?: WinnerCode | null;
};

export type RawMatchLike = {
  match_id?: string | null;
  start_ts?: number | string | null;
  time_control?: string | null;
  source?: string | null;
  players?: string[] | null;
  games?: RawGameObject[] | null;
  ratings?: RawRatingsByPlayer | null;
};

export type RawMatchSourceFields = Pick<RawMatchLike, "source">;

export type MappedGameSummary = {
  id: string;
  index: number;
  resultLabel: string;
  scoreAAfter: number;
  scoreBAfter: number;
};

export type MatchCardData = {
  matchId: string;
  mode?: Mode | "";
  playerA: string;
  playerB: string;
  startTs: number;
  timeControl: string | null;
  sourceValue: string;
  firstGameId: string | number;
  scoreA: number;
  scoreB: number;
  playerABeforeRating: number;
  playerAAfterRating: number;
  playerABeforeRd: number;
  playerAAfterRd: number;
  playerBBeforeRating: number;
  playerBAfterRating: number;
  playerBBeforeRd: number;
  playerBAfterRd: number;
  games: MappedGameSummary[];
  gameCount?: number;
  playerAWins?: number;
  playerBWins?: number;
  draws?: number;
};
