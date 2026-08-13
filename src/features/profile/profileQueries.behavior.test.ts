import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultSourceFilters } from "../../constants/matches";
import type { ParsedMatch } from "../../lib/matches/matchData";
import type { ProfileFilters } from "./profileFilters";

const loadRawMatchesByMode = vi.hoisted(() => vi.fn());

vi.mock("../../lib/matches/matchData", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/matches/matchData")>()),
  loadRawMatchesByMode,
}));

import { favoriteOpponentsQueryOptions, profileMatchHistoryQueryOptions } from "./profileQueries";

const filters = (overrides: Partial<ProfileFilters> = {}): ProfileFilters => ({
  opponentRatingMin: 1000,
  opponentRatingMax: 2500,
  opponentFilter: "",
  startDateFilter: "",
  endDateFilter: "",
  sourceFilters: { ...defaultSourceFilters },
  timeControlInitialFilter: "all",
  timeControlIncrementFilter: "all",
  ...overrides,
});

const match = (id: string, startTs: number, opponent = "bob", player = "alice"): ParsedMatch => ({
  match_id: id,
  players: [player, opponent],
  start_ts: startTs,
  time_control: "60+0",
  source: "lobby",
  tournament_id: null,
  games: [{ id: `${id}-game`, game_index: 1, winner: "white", white: player, black: opponent }],
  ratings: {
    [player]: { before_rating: 1800, after_rating: 1805, before_rd: 50, after_rd: 49 },
    [opponent]: { before_rating: 1750, after_rating: 1745, before_rd: 50, after_rd: 49 },
  },
});

const run = async <T>(options: { queryFn?: (context: never) => T | Promise<T> }): Promise<T> => {
  if (!options.queryFn) throw new Error("Expected query options to include a queryFn");
  return options.queryFn({} as never);
};

beforeEach(() => {
  loadRawMatchesByMode.mockReset();
});

describe("profile match query behavior", () => {
  it("uses server paging without changing the server total", async () => {
    loadRawMatchesByMode.mockResolvedValue({ matches: [match("m1", 100)], total: 87 });

    const result = await run(profileMatchHistoryQueryOptions("alice", "blitz", filters(), 3, 25));

    expect(loadRawMatchesByMode).toHaveBeenCalledWith("blitz", {
      filters: { username: "alice", sourceFilters: defaultSourceFilters },
      page: 3,
      pageSize: 25,
    });
    expect(result.total).toBe(87);
    expect(result.matches[0]).toMatchObject({ matchId: "m1", opponent: "bob", score: "1-0" });
  });

  it("loads and normalizes the full result before client-paging opponent searches", async () => {
    loadRawMatchesByMode.mockResolvedValue([
      match("included", 100),
      match("unrelated", 90, "dave", "carol"),
    ]);

    const result = await run(
      profileMatchHistoryQueryOptions(
        "alice",
        "hyperbullet",
        filters({ opponentFilter: "bob" }),
        4,
        25,
      ),
    );

    expect(loadRawMatchesByMode).toHaveBeenCalledWith("hyperbullet", {
      filters: { username: "alice", sourceFilters: defaultSourceFilters },
    });
    expect(result.total).toBe(1);
    expect(result.matches.map((entry) => entry.matchId)).toEqual(["included"]);
  });

  it("fetches enough pages per mode, then applies one global recency limit", async () => {
    loadRawMatchesByMode.mockImplementation(
      async (mode: "blitz" | "bullet", options: { page: number }) => {
        const count = options.page === 1 ? 200 : 60;
        const timestampBase = mode === "bullet" ? 10_000 : 1_000;
        return {
          matches: Array.from({ length: count }, (_, index) =>
            match(
              `${mode}-${options.page}-${index}`,
              timestampBase - options.page * 100 - index,
              mode,
            ),
          ),
          total: 260,
        };
      },
    );

    const rows = await run(favoriteOpponentsQueryOptions("alice", "all", 250, ["blitz", "bullet"]));

    expect(loadRawMatchesByMode).toHaveBeenCalledTimes(4);
    expect(loadRawMatchesByMode).toHaveBeenCalledWith(
      "blitz",
      expect.objectContaining({ page: 2 }),
    );
    expect(loadRawMatchesByMode).toHaveBeenCalledWith(
      "bullet",
      expect.objectContaining({ page: 2 }),
    );
    expect(rows.reduce((total, row) => total + row.matchCount, 0)).toBe(250);
    expect(rows.map((row) => row.opponent)).toEqual(["bullet"]);
  });
});
