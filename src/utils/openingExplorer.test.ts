import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildOpeningExplorerUrl,
  fetchExplorerApiResponse,
  mergeExplorerApiResponses,
} from "./openingExplorer";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildOpeningExplorerUrl", () => {
  it("includes valid general filters but scopes player-only filters to a username", () => {
    const general = new URL(
      buildOpeningExplorerUrl({
        fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
        speeds: [2, 0],
        startDate: "2025-01",
        endDate: "not-a-month",
        color: "black",
        minRating: 1900,
        opponent: "bob",
      }),
      "https://example.test",
    );
    expect(Object.fromEntries(general.searchParams)).toEqual({
      fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
      speeds: "2,0",
      startDate: "2025-01",
    });

    const player = new URL(
      buildOpeningExplorerUrl({
        fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
        speeds: [0, 1],
        username: " Alice ",
        color: "white",
        minRating: 1800,
        opponent: " Bob ",
      }),
      "https://example.test",
    );
    expect(Object.fromEntries(player.searchParams)).toMatchObject({
      username: "Alice",
      color: "white",
      minRating: "1800",
      opponent: "Bob",
    });
  });
});

describe("fetchExplorerApiResponse", () => {
  it("coalesces identical in-flight work and evicts it after settlement", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn(async () => {
      await gate;
      return jsonResponse({ moves: [], recentGames: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = fetchExplorerApiResponse("/api/opening-explorer?case=dedupe", "visible");
    const duplicate = fetchExplorerApiResponse("/api/opening-explorer?case=dedupe", "visible");
    const differentIntent = fetchExplorerApiResponse(
      "/api/opening-explorer?case=dedupe",
      "practice",
    );
    expect(duplicate).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    release();
    await Promise.all([first, duplicate, differentIntent]);
    await fetchExplorerApiResponse("/api/opening-explorer?case=dedupe", "visible");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/opening-explorer?case=dedupe", {
      headers: { "X-Explorer-Intent": "visible" },
    });
  });

  it("passes cancellation through to fetch without sharing another caller's signal", async () => {
    const fetchMock = vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const a = new AbortController();
    const b = new AbortController();
    const first = fetchExplorerApiResponse("/api/opening-explorer?case=abort", "visible", a.signal);
    const second = fetchExplorerApiResponse(
      "/api/opening-explorer?case=abort",
      "visible",
      b.signal,
    );
    const rejectedFirst = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const rejectedSecond = expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    a.abort();
    await rejectedFirst;
    expect(b.signal.aborted).toBe(false);
    b.abort();
    await rejectedSecond;
  });

  it("sends navigation ordering in headers without changing the position cache URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ moves: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await fetchExplorerApiResponse(
      "/api/opening-explorer?case=ordering",
      "visible",
      controller.signal,
      { session: "7df5aa4d-e7c6-4caf-b1fc-5b1474e9891a", sequence: 2 },
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/opening-explorer?case=ordering", {
      signal: controller.signal,
      headers: {
        "X-Explorer-Intent": "visible",
        "X-Explorer-Session": "7df5aa4d-e7c6-4caf-b1fc-5b1474e9891a",
        "X-Explorer-Sequence": "2",
      },
    });
  });

  it("evicts rejected requests so a transient failure can be retried", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "busy" }, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ moves: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchExplorerApiResponse("/api/opening-explorer?case=retry", "visible"),
    ).rejects.toThrow("busy");
    await expect(
      fetchExplorerApiResponse("/api/opening-explorer?case=retry", "visible"),
    ).resolves.toEqual({ moves: [], recentGames: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [new Response("<!doctype html><html></html>"), "returned the app page"],
    [jsonResponse({ recentGames: [] }), "unexpected response"],
  ])("rejects an invalid successful response", async (response, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(
      fetchExplorerApiResponse(`/api/opening-explorer?case=${message}`, "visible"),
    ).rejects.toThrow(message);
  });
});

describe("mergeExplorerApiResponses", () => {
  it("sums outcomes, uses a game-weighted rating, sorts moves, and preserves recent games", () => {
    const merged = mergeExplorerApiResponses([
      {
        moves: [
          {
            uci: "a1a2",
            games: 10,
            whiteWins: 4,
            draws: 2,
            blackWins: 4,
            avgOpponentRating: 1800,
          },
        ],
        recentGames: [{ gameId: "g1" } as never],
      },
      {
        moves: [
          {
            uci: "a1a2",
            games: 30,
            whiteWins: 10,
            draws: 5,
            blackWins: 15,
            avgOpponentRating: 2000,
          },
          {
            uci: "b1b2",
            games: 50,
            whiteWins: 20,
            draws: 10,
            blackWins: 20,
            avgOpponentRating: null,
          },
        ],
        recentGames: [{ gameId: "g2" } as never],
      },
    ]);

    expect(merged.moves).toEqual([
      {
        uci: "b1b2",
        games: 50,
        whiteWins: 20,
        draws: 10,
        blackWins: 20,
        avgOpponentRating: null,
      },
      {
        uci: "a1a2",
        games: 40,
        whiteWins: 14,
        draws: 7,
        blackWins: 19,
        avgOpponentRating: 1950,
      },
    ]);
    expect(merged.recentGames.map((game) => game.gameId)).toEqual(["g1", "g2"]);
  });
});
