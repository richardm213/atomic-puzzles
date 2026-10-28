import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchArchiveJson = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  appendArchiveParam: (params: URLSearchParams, key: string, value: unknown) => {
    if (value !== undefined && value !== null && String(value).trim()) {
      params.set(key, String(value));
    }
  },
  fetchArchiveJson,
}));

import { fetchMatchRowsFromArchive } from "./matches";

describe("fetchMatchRowsFromArchive", () => {
  beforeEach(() => {
    fetchArchiveJson.mockReset();
    fetchArchiveJson.mockResolvedValue({ rows: [], total: 0 });
  });

  it("maps a partial source filter to every enabled normalized source", async () => {
    await fetchMatchRowsFromArchive("blitz", { sourceFilters: { arena: false } }, { pageSize: 25 });

    const params = fetchArchiveJson.mock.calls[0]?.[0] as URLSearchParams;
    expect(params.get("sources")).toBe("friend,lobby,swiss,chesscom,unknown");
  });

  it("sends an empty source list when every source is disabled", async () => {
    await fetchMatchRowsFromArchive(
      "bullet",
      {
        sourceFilters: {
          arena: false,
          friend: false,
          lobby: false,
          swiss: false,
          chesscom: false,
          unknown: false,
        },
      },
      { pageSize: 25 },
    );

    const params = fetchArchiveJson.mock.calls[0]?.[0] as URLSearchParams;
    expect(params.has("sources")).toBe(true);
    expect(params.get("sources")).toBe("");
  });

  it("supports atomic960 archive reads even though the current match UI does not list that mode", async () => {
    await fetchMatchRowsFromArchive("atomic960", {}, { pageSize: 25 });

    const params = fetchArchiveJson.mock.calls[0]?.[0] as URLSearchParams;
    expect(params.get("mode")).toBe("atomic960");
  });

  it("can look up a globally unique match id without a mode", async () => {
    await fetchMatchRowsFromArchive(undefined, { matchId: "Yr9V8s5R" }, { pageSize: 1 });

    const params = fetchArchiveJson.mock.calls[0]?.[0] as URLSearchParams;
    expect(params.has("mode")).toBe(false);
    expect(params.get("matchId")).toBe("Yr9V8s5R");
  });

  it("sends player-pair and partial time-control filters to the archive", async () => {
    await fetchMatchRowsFromArchive(
      "blitz",
      {
        usernamePair: ["Alice", "Bob"],
        timeControlInitial: "3",
        timeControlIncrement: "2",
      },
      { pageSize: 25 },
    );

    const params = fetchArchiveJson.mock.calls[0]?.[0] as URLSearchParams;
    expect(params.get("pairA")).toBe("alice");
    expect(params.get("pairB")).toBe("bob");
    expect(params.get("timeControlInitial")).toBe("3");
    expect(params.get("timeControlIncrement")).toBe("2");
  });

  it("only sends the rating filter type with a complete rating range", async () => {
    await fetchMatchRowsFromArchive("blitz", { username: "alice" }, { pageSize: 25 });

    const unfilteredParams = fetchArchiveJson.mock.calls[0]?.[0] as URLSearchParams;
    expect(unfilteredParams.has("ratingFilterType")).toBe(false);
    expect(unfilteredParams.has("ratingMin")).toBe(false);
    expect(unfilteredParams.has("ratingMax")).toBe(false);

    await fetchMatchRowsFromArchive(
      "blitz",
      { username: "alice", opponentRatingMin: 1500, opponentRatingMax: 2000 },
      { pageSize: 25 },
    );

    const filteredParams = fetchArchiveJson.mock.calls[1]?.[0] as URLSearchParams;
    expect(filteredParams.get("ratingFilterType")).toBe("both");
    expect(filteredParams.get("ratingMin")).toBe("1500");
    expect(filteredParams.get("ratingMax")).toBe("2000");
  });

  it("retries recent matches without includeTotal for older archive endpoints", async () => {
    fetchArchiveJson
      .mockRejectedValueOnce(new Error("Unexpected query parameter: includeTotal"))
      .mockResolvedValueOnce({
        rows: [{ match_id: "match-1" }],
        total: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      });

    await expect(
      fetchMatchRowsFromArchive("blitz", {}, { pageSize: 25, includeTotal: false }),
    ).resolves.toMatchObject({ rows: [{ match_id: "match-1" }] });

    const optimizedParams = fetchArchiveJson.mock.calls[0]?.[0] as URLSearchParams;
    const compatibleParams = fetchArchiveJson.mock.calls[1]?.[0] as URLSearchParams;
    expect(optimizedParams.get("includeTotal")).toBe("false");
    expect(compatibleParams.has("includeTotal")).toBe(false);
  });
});
