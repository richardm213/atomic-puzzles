import { fetchArchiveJson } from "./client";
import type { ArchiveMatchSource, ArchiveMode } from "./types";

export type ArchiveGame = {
  game_id: string;
  game_index: number;
  result: number;
  moves: string[] | null;
  clocks: number[] | null;
  move_ts: number[] | null;
  external_match_id: string;
  mode: ArchiveMode;
  start_ts: number;
  source: ArchiveMatchSource;
  player_1: string;
  player_2: string;
  time_control: string;
  tournament: string | null;
  p1_before_rating: number | null;
  p1_after_rating: number | null;
  p1_before_rd: number | null;
  p1_after_rd: number | null;
  p2_before_rating: number | null;
  p2_after_rating: number | null;
  p2_before_rd: number | null;
  p2_after_rd: number | null;
  ratings_are_per_game?: boolean;
};

export const fetchArchiveGame = async (
  gameId: string,
  signal?: AbortSignal,
): Promise<ArchiveGame | null> => {
  const params = new URLSearchParams({ resource: "game", gameId });
  return fetchArchiveJson<ArchiveGame | null>(params, signal);
};

export const decodeGameResult = (game: Pick<ArchiveGame, "result" | "player_1" | "player_2">) => {
  const player1IsWhite = (game.result & 1) === 0;
  const winnerPlayer = game.result >> 1;
  const white = player1IsWhite ? game.player_1 : game.player_2;
  const black = player1IsWhite ? game.player_2 : game.player_1;
  const whitePlayer = player1IsWhite ? 1 : 2;
  const winner = winnerPlayer === 0 ? null : winnerPlayer === whitePlayer ? "white" : "black";
  return { white, black, winner } as const;
};
