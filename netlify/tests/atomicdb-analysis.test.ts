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
          analysis: { lines: [{ move: "g1f3", depth: 26, pv: ["g1f3"] }] },
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
    expect(body.moves[0]).toMatchObject({ uci: "g1f3", search_depth: 26 });
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

  it("loads a batch of positions in parallel without caching the response", async () => {
    const resolvers: Array<() => void> = [];
    const fetchMock = vi.fn().mockImplementation(
      (input: string | URL | Request) =>
        new Promise<Response>((resolve) => {
          const url = input as URL;
          resolvers.push(() =>
            resolve(
              new Response(
                JSON.stringify({
                  key: url.searchParams.get("fen"),
                  status: "UNKNOWN",
                  moves: [],
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            ),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { handler } = await import("../functions/atomicdb-analysis");
    const fens = [
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    ];
    const responsePromise = handler({
      httpMethod: "POST",
      body: JSON.stringify({ fens }),
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolvers.forEach((resolve) => resolve());
    const response = await responsePromise;

    expect(response.statusCode).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(Object.keys(JSON.parse(response.body).positions)).toEqual(fens);
  });

  it("bounds batch fan-out so one request cannot flood the upstream service", async () => {
    const releases: Array<() => void> = [];
    let inFlight = 0;
    let peakInFlight = 0;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          inFlight += 1;
          peakInFlight = Math.max(peakInFlight, inFlight);
          releases.push(() => {
            inFlight -= 1;
            resolve(
              new Response(JSON.stringify({ status: "UNKNOWN", moves: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            );
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { handler } = await import("../functions/atomicdb-analysis");
    const fens = Array.from({ length: 8 }, (_, index) => `8/8/8/8/8/8/8/K6k w - - ${index} 1`);
    const responsePromise = handler({
      httpMethod: "POST",
      body: JSON.stringify({ fens }),
    });

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
    expect(peakInFlight).toBe(6);
    releases.splice(0).forEach((release) => release());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(8));
    releases.splice(0).forEach((release) => release());

    expect((await responsePromise).statusCode).toBe(200);
    expect(peakInFlight).toBe(6);
  });

  it("proxies the complete principal-variation bundle with one upstream request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          position: {
            key: "root-key",
            status: "UNKNOWN",
            best_move: "g1f3",
            moves: [
              { uci: "g1f3", score: 1100 },
              { uci: "g1h3", score: 786 },
            ],
          },
          lines: {
            g1f3: ["g1f3", "f7f6", "b1c3"],
            g1h3: ["g1h3", "e7e6", "e2e4"],
          },
          positions: {
            "child fen": {
              key: "child-key",
              status: "UNKNOWN",
              score: -1100,
              best_move: "f7f6",
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { handler } = await import("../functions/atomicdb-analysis");
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const response = await handler({
      httpMethod: "GET",
      queryStringParameters: { fen, line_count: "2", ply_count: "3" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["Cache-Control"]).toContain("public");
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestedUrl = fetchMock.mock.calls[0]![0] as URL;
    expect(requestedUrl.origin + requestedUrl.pathname).toBe(
      "https://belzedar.duckdns.org/atomicdb/api/principal-variations",
    );
    expect(requestedUrl.searchParams.get("line_count")).toBe("2");
    expect(requestedUrl.searchParams.get("ply_count")).toBe("3");
    const body = JSON.parse(response.body);
    expect(body.position.key).toBe("root-key");
    expect(body.lines).toEqual({
      g1f3: ["g1f3", "f7f6", "b1c3"],
      g1h3: ["g1h3", "e7e6", "e2e4"],
    });
    expect(body.positions["child fen"].best_move).toBe("f7f6");
  });
});
