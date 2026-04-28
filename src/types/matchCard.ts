import type { MappedGameSummary } from "../lib/matches/matchSummaries";
import type { Mode } from "../constants/matches";

/**
 * Shape consumed by MatchCard / MatchDetails. This is the H2H/match-row
 * shape — players A & B with ratings, scores, and game-by-game summaries.
 */
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
