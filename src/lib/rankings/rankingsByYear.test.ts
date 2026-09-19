import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../archive/leaderboard", () => ({ fetchYearlyLeaderboardRows: vi.fn() }));

import { fetchYearlyLeaderboardRows } from "../archive/leaderboard";
import { loadRankingsForYear } from "./rankingsByYear";

const fetchRows = fetchYearlyLeaderboardRows as unknown as ReturnType<typeof vi.fn>;

describe("loadRankingsForYear", () => {
  beforeEach(() => fetchRows.mockReset());
  afterEach(() => fetchRows.mockReset());

  it("groups the three yearly modes and has no RD", async () => {
    fetchRows.mockResolvedValueOnce([
      { username: "alice", year: 2026, tc: "blitz", rank: 2, rating: 1900.04, games: 150 },
      { username: "bob", year: 2026, tc: "blitz", rank: 1, rating: 2100, games: 200 },
      { username: "wolf", year: 2026, tc: "wolfrandom", rank: 1, rating: 2500, games: 500 },
    ]);

    const result = await loadRankingsForYear(2026);
    expect(result.blitz.players.map((row) => row.username)).toEqual(["bob", "alice"]);
    expect(result.blitz.players[1]).toMatchObject({ score: 1900, rd: null, games: 150 });
    expect(result.wolfrandom.players).toEqual([]);
  });

  it("rejects invalid years", async () => {
    await expect(loadRankingsForYear(2015)).rejects.toThrow(/Invalid year/);
  });
});
