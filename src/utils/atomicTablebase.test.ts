import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAtomicTablebase } from "./atomicTablebase";

describe("fetchAtomicTablebase", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the shared Lichess probe and derives mate distance for its best line", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            category: "win",
            dtz: 11,
            checkmate: false,
            stalemate: false,
            variant_win: false,
            variant_loss: false,
            moves: [
              {
                uci: "h2h1",
                category: "loss",
                dtz: -10,
                zeroing: false,
                checkmate: false,
                stalemate: false,
                variant_win: false,
                variant_loss: false,
              },
              {
                uci: "h2a2",
                category: "loss",
                dtz: -10,
                zeroing: false,
                checkmate: false,
                stalemate: false,
                variant_win: false,
                variant_loss: false,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            winner: "w",
            mainline: [
              "h2h1",
              "f8e8",
              "h1d5",
              "e8d7",
              "e7f8",
              "d7c7",
              "d5d6",
              "c7b7",
              "d6b6",
              "b7a8",
              "b6a7",
            ].map((uci) => ({ uci })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAtomicTablebase("5k2/4Kp2/5P2/8/8/8/7Q/8 w - - 0 1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result?.position.moves[0]).toMatchObject({ uci: "h2h1", mate: 6 });
    expect(result?.position.moves[1]).toMatchObject({ uci: "h2a2", mate: 6 });
    expect(result?.principalVariations.h2h1).toEqual(["h2h1", "f8e8", "h1d5", "e8d7", "e7f8"]);
  });

  it("uses DTZ as mate distance for every non-zeroing move in a locked QPP ending", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            category: "win",
            dtz: 7,
            checkmate: false,
            stalemate: false,
            variant_win: false,
            variant_loss: false,
            moves: [
              {
                uci: "e7f8",
                category: "loss",
                dtz: -6,
                zeroing: false,
                checkmate: false,
                stalemate: false,
                variant_win: false,
                variant_loss: false,
              },
              {
                uci: "e7e8",
                category: "loss",
                dtz: -8,
                zeroing: false,
                checkmate: false,
                stalemate: false,
                variant_win: false,
                variant_loss: false,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchAtomicTablebase("8/4Kp2/3k1P2/3Q4/8/8/8/8 w - - 6 4");

    expect(result?.position.moves[0]).toMatchObject({ uci: "e7f8", mate: 4 });
    expect(result?.position.moves[1]).toMatchObject({ uci: "e7e8", mate: 5 });
  });

  it("surfaces a Lichess mainline rate limit so analysis can fall back to the engine", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            category: "win",
            dtz: 7,
            checkmate: false,
            stalemate: false,
            variant_win: false,
            variant_loss: false,
            moves: [
              {
                uci: "e7f8",
                category: "loss",
                dtz: -6,
                zeroing: false,
                checkmate: false,
                stalemate: false,
                variant_win: false,
                variant_loss: false,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchAtomicTablebase("8/4Kp2/3k1P2/3Q4/8/8/8/8 b - - 6 4")).rejects.toThrow(
      "returned 429",
    );
  });
});
