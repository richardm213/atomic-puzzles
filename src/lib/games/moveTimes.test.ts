import { describe, expect, it } from "vitest";

import type { ArchiveGame } from "../archive/games";
import { moveDurationsMilliseconds } from "./moveTimes";

const game = (overrides: Partial<ArchiveGame>): ArchiveGame => ({
  game_id: "game-1",
  game_index: 1,
  result: 2,
  moves: ["e2e4", "e7e5", "g1f3"],
  clocks: [178_516, 178_751, 179_248],
  move_ts: [10_000, 13_405, 14_954],
  external_match_id: "match-1",
  mode: "blitz",
  start_ts: 1_000,
  source: "chesscom",
  player_1: "alice",
  player_2: "bob",
  time_control: "3+2",
  tournament: null,
  p1_before_rating: null,
  p1_after_rating: null,
  p1_before_rd: null,
  p1_after_rd: null,
  p2_before_rating: null,
  p2_after_rating: null,
  p2_before_rd: null,
  p2_after_rd: null,
  ...overrides,
});

describe("moveDurationsMilliseconds", () => {
  it("uses stored timestamp deltas and falls back to clock arithmetic where needed", () => {
    expect(moveDurationsMilliseconds(game({}))).toEqual([3_484, 3_405, 1_549]);
    expect(moveDurationsMilliseconds(game({ move_ts: null }))).toEqual([3_484, 3_249, 1_268]);
  });
});
