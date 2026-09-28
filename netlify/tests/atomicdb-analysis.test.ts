import { afterEach, describe, expect, it, vi } from "vitest";

describe("atomicdb-analysis function", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies a validated FEN through AtomicDB's GET query endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          key: "position-key",
          status: "UNKNOWN",
          moves: ["g1f3", "g1h3", "e2e3", "d2d4", "e2e4", "b1c3"].map((uci) => ({
            uci,
            score: 1057,
          })),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { handler } = await import("../functions/atomicdb-analysis");
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const response = await handler({ httpMethod: "GET", queryStringParameters: { fen } });

    expect(response.statusCode).toBe(200);
    const requestedUrl = fetchMock.mock.calls[0]![0] as URL;
    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      "https://belzedar.duckdns.org/atomicdb/api/query",
    );
    expect(requestedUrl.searchParams.get("fen")).toBe(fen);
    const body = JSON.parse(response.body);
    expect(body.moves).toHaveLength(5);
    expect(body.key).toBe("position-key");
    expect(body.moves[0]).toMatchObject({ uci: "g1f3" });
  });

  it("rejects missing FENs without making an upstream request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { handler } = await import("../functions/atomicdb-analysis");
    const response = await handler({ httpMethod: "GET", queryStringParameters: {} });

    expect(response.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves a not-found response for positions outside AtomicDB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const { handler } = await import("../functions/atomicdb-analysis");
    const response = await handler({
      httpMethod: "GET",
      queryStringParameters: { fen: "8/8/8/8/8/8/8/K6k w - - 0 1" },
    });

    expect(response.statusCode).toBe(404);
  });
});
