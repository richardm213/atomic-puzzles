import { afterEach, describe, expect, it, vi } from "vitest";

describe("atomic-tablebase function", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("normalizes Lichess atomic WDL, DTM, and mainline data for the analysis board", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            category: "win",
            moves: [
              { uci: "h2h4", category: "loss", dtm: -7 },
              { uci: "h2h3", category: "draw", dtm: null },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ mainline: [{ uci: "h2h4" }, { uci: "d4e5" }, { uci: "h4h5" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { handler } = await import("../functions/atomic-tablebase");
    const fen = "8/8/8/8/3k4/8/1K5P/7R w - - 3 71";

    const response = await handler({ httpMethod: "GET", queryStringParameters: { fen } });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(response.body);
    expect(body.position).toMatchObject({ status: "WHITE_WIN", best_move: "h2h4" });
    expect(body.position.moves[0]).toMatchObject({
      uci: "h2h4",
      status: "WHITE_WIN",
      mate: 7,
    });
    expect(body.lines.h2h4).toEqual(["h2h4", "d4e5", "h4h5"]);
  });
});
