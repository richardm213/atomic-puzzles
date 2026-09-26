import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMatchRowsFromArchive = vi.hoisted(() => vi.fn());

vi.mock("../archive/matches", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../archive/matches")>()),
  fetchMatchRowsFromArchive,
}));

import { loadRawMatchesByMode } from "./data";

describe("loadRawMatchesByMode archive rows", () => {
  beforeEach(() => fetchMatchRowsFromArchive.mockReset());

  it("merges all supported modes into one recency-sorted page", async () => {
    const timestamps = { blitz: 400, bullet: 300, hyperbullet: 200, wolfrandom: 100 } as const;
    fetchMatchRowsFromArchive.mockImplementation(async (mode: keyof typeof timestamps) => ({
      total: 1,
      rows: [
        {
          match_id: `${mode}-match`,
          mode,
          player_1: "alice",
          player_2: "bob",
          start_ts: timestamps[mode],
          time_control: "3+0",
          source: "lobby",
          tournament_id: null,
          games: [`${mode}-game,w,1,1`],
          p1_before_rating: null,
          p1_after_rating: null,
          p1_before_rd: null,
          p1_after_rd: null,
          p2_before_rating: null,
          p2_after_rating: null,
          p2_before_rd: null,
          p2_after_rd: null,
        },
      ],
    }));

    const result = await loadRawMatchesByMode("all", { page: 1, pageSize: 2 });

    expect(result.total).toBe(4);
    expect(result.matches.map((match) => match.match_id)).toEqual(["blitz-match", "bullet-match"]);
    expect(fetchMatchRowsFromArchive).toHaveBeenCalledTimes(4);
  });

  it("decodes Turso's pipe-split compact game entries and preserves nullable ratings", async () => {
    fetchMatchRowsFromArchive.mockResolvedValue({
      total: 1,
      rows: [
        {
          match_id: "match-1",
          player_1: "alice",
          player_2: "bob",
          start_ts: 1_700_000_000_000,
          time_control: "3+2",
          source: "unknown",
          tournament_id: null,
          games: ["game-1,w,1,1", "game-2,d,0,2"],
          p1_before_rating: null,
          p1_after_rating: null,
          p1_before_rd: null,
          p1_after_rd: null,
          p2_before_rating: 1800,
          p2_after_rating: 1800,
          p2_before_rd: 50,
          p2_after_rd: 49.5,
        },
      ],
    });

    const matches = await loadRawMatchesByMode("blitz");

    expect(matches).toEqual([
      expect.objectContaining({
        match_id: "match-1",
        players: ["alice", "bob"],
        source: "unknown",
        games: [
          { id: "game-1", game_index: 1, winner: "white", white: "alice", black: "bob" },
          { id: "game-2", game_index: 2, winner: "draw", white: "bob", black: "alice" },
        ],
        ratings: expect.objectContaining({
          alice: {
            before_rating: null,
            after_rating: null,
            before_rd: null,
            after_rd: null,
          },
        }),
      }),
    ]);
  });
});
