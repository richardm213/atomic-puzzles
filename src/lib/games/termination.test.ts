import { describe, expect, it } from "vitest";

import type { ArchiveGame } from "../archive/games";
import { gameTerminationLabel } from "./termination";

const game = (overrides: Partial<ArchiveGame>): ArchiveGame => ({
  game_id: "game-1",
  game_index: 0,
  result: 4,
  moves: ["e2e4"],
  clocks: [10_000],
  move_ts: null,
  external_match_id: "match-1",
  mode: "blitz",
  start_ts: 1,
  source: "chesscom",
  player_1: "white-player",
  player_2: "black-player",
  time_control: "3+0",
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

describe("gameTerminationLabel", () => {
  it("distinguishes clock, board, and fallback terminations", () => {
    expect(gameTerminationLabel(game({ clocks: [0] }))).toBe("White timed out");
    expect(
      gameTerminationLabel(
        game({ moves: ["f2f3", "e7e5", "g2g4", "d8h4"], clocks: [10_000, 10_000] }),
      ),
    ).toBe("Black wins by checkmate");
    expect(
      gameTerminationLabel(
        game({
          moves: [
            "g1f3",
            "f7f6",
            "e2e3",
            "e7e6",
            "f3g5",
            "f6g5",
            "d1f3",
            "g8f6",
            "f3f4",
            "f8b4",
            "c2c3",
            "f6e4",
            "f4f8",
            "e4d2",
          ],
          clocks: null,
        }),
      ),
    ).toBe("Black wins by explosion");
    expect(gameTerminationLabel(game({ clocks: [10_000] }))).toBe("White resigned");
    expect(gameTerminationLabel(game({ result: 0 }))).toBe("Draw");
  });
});
