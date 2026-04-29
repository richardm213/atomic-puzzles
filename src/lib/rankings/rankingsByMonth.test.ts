import { afterEach,beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabase/supabaseLb", async () => {
  const actual = await vi.importActual<typeof import("../supabase/supabaseLb")>(
    "../supabase/supabaseLb",
  );
  return {
    ...actual,
    fetchLbRows: vi.fn(),
  };
});

import { fetchLbRows } from "../supabase/supabaseLb";
import { loadRankingsForMonth } from "./rankingsByMonth";

const fetchLbRowsMock = fetchLbRows as unknown as ReturnType<typeof vi.fn>;

describe("loadRankingsForMonth", () => {
  beforeEach(() => {
    fetchLbRowsMock.mockReset();
  });

  afterEach(() => {
    fetchLbRowsMock.mockReset();
  });

  it("groups players by mode and reranks them by score", async () => {
    fetchLbRowsMock.mockResolvedValueOnce([
      { username: "alice", tc: "blitz", rank: 5, rating: 1900, rd: 50, games: 30 },
      { username: "bob", tc: "blitz", rank: 1, rating: 2000, rd: 45, games: 40 },
      { username: "carol", tc: "bullet", rank: 1, rating: 2100, rd: 40, games: 50 },
      { username: "dave", tc: "irrelevant", rank: 1, rating: 9999, rd: 0, games: 0 },
    ]);

    const result = await loadRankingsForMonth("Mar 2024");

    // sorted by score desc → bob first
    expect(result.blitz.players[0]?.username).toBe("bob");
    expect(result.blitz.players[1]?.username).toBe("alice");
    expect(result.blitz.players[0]?.rank).toBe(1);
    expect(result.blitz.players[1]?.rank).toBe(2);

    expect(result.bullet.players).toHaveLength(1);
    expect(result.bullet.players[0]?.username).toBe("carol");

    // unknown modes are dropped
    expect(result.hyperbullet.players).toEqual([]);
  });

  it("rounds scores and RD to one decimal place", async () => {
    fetchLbRowsMock.mockResolvedValueOnce([
      { username: "alice", tc: "blitz", rank: 1, rating: 1899.456, rd: 47.91, games: 25 },
    ]);
    const result = await loadRankingsForMonth("Mar 2024");
    expect(result.blitz.players[0]?.score).toBe(1899.5);
    expect(result.blitz.players[0]?.rd).toBe(47.9);
  });

  it("throws on an invalid month key", async () => {
    await expect(loadRankingsForMonth("definitely-not-a-month")).rejects.toThrow(/Invalid month/);
  });
});
