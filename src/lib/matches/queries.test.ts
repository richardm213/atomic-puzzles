import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchPlayerRatingsRows: vi.fn(),
  getTournamentMatchLocation: vi.fn(),
  loadRawMatchesByMode: vi.fn(),
  resolveUsernameInputs: vi.fn(),
}));

vi.mock("./data", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./data")>()),
  loadRawMatchesByMode: mocks.loadRawMatchesByMode,
}));
vi.mock("./tournaments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tournaments")>()),
  getTournamentMatchLocation: mocks.getTournamentMatchLocation,
}));
vi.mock("../archive/ratings", () => ({
  fetchPlayerRatingsRows: mocks.fetchPlayerRatingsRows,
}));
vi.mock("../users/usernameSearch", () => ({ resolveUsernameInputs: mocks.resolveUsernameInputs }));

import {
  h2hMatchupQueryOptions,
  matchDetailQueryOptions,
  recentMatchesPageQueryOptions,
} from "./queries";

const run = async <T>(options: { queryFn?: (context: never) => T | Promise<T> }): Promise<T> => {
  if (!options.queryFn) throw new Error("Expected query options to include a queryFn");
  return options.queryFn({} as never);
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
});

describe("match query behavior", () => {
  it("returns match data even when optional tournament lookup fails", async () => {
    const rawMatch = { match_id: "m1" };
    mocks.loadRawMatchesByMode.mockResolvedValue([rawMatch]);
    mocks.getTournamentMatchLocation.mockRejectedValue(new Error("catalog unavailable"));

    await expect(run(matchDetailQueryOptions("blitz", "m1"))).resolves.toEqual({
      match: rawMatch,
      tournamentLocation: null,
    });
  });

  it("rejects a missing match instead of returning an empty detail shell", async () => {
    mocks.loadRawMatchesByMode.mockResolvedValue([]);
    mocks.getTournamentMatchLocation.mockResolvedValue(null);

    await expect(run(matchDetailQueryOptions("bullet", "missing"))).rejects.toThrow(
      "Match not found.",
    );
  });

  it("forwards recent-match paging and filters without client-side reinterpretation", async () => {
    const page = { matches: [{ match_id: "m1" }], total: 51 };
    mocks.loadRawMatchesByMode.mockResolvedValue(page);
    const matchFilters = { username: "alice", timeControl: "60+0" };

    await expect(run(recentMatchesPageQueryOptions("blitz", matchFilters, 2, 25))).resolves.toBe(
      page,
    );
    expect(mocks.loadRawMatchesByMode).toHaveBeenCalledWith("blitz", {
      filters: matchFilters,
      page: 2,
      pageSize: 25,
    });
  });

  it("resolves both H2H aliases before loading every mode and rating snapshot", async () => {
    mocks.resolveUsernameInputs.mockResolvedValue(["canonical-a", "canonical-b"]);
    mocks.loadRawMatchesByMode.mockImplementation(async (mode: string) => [mode]);
    mocks.fetchPlayerRatingsRows.mockImplementation(async ({ username }: { username: string }) => [
      username,
    ]);

    const result = await run(h2hMatchupQueryOptions("alias-a", "alias-b"));

    expect(mocks.loadRawMatchesByMode).toHaveBeenCalledTimes(4);
    expect(mocks.loadRawMatchesByMode).toHaveBeenCalledWith("blitz", {
      filters: { usernamePair: ["canonical-a", "canonical-b"] },
    });
    expect(result).toMatchObject({
      resolvedPlayer1: "canonical-a",
      resolvedPlayer2: "canonical-b",
      player1Ratings: ["canonical-a"],
      player2Ratings: ["canonical-b"],
    });
  });
});
