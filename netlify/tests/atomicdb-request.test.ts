import { afterEach, describe, expect, it, vi } from "vitest";

const SAME_ORIGIN_HEADERS = { host: "atomic.example", origin: "https://atomic.example" };
const FEN = "8/8/8/8/8/8/8/K6k w - - 0 1";

describe("atomicdb-request function", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues a missing position anonymously without buying a deeper repeat search", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ task: 42, task_state: "waiting", budget_nodes: 128_000_000 }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { handler } = await import("../functions/atomicdb-request");

    const response = await handler({
      httpMethod: "POST",
      headers: SAME_ORIGIN_HEADERS,
      body: JSON.stringify({ fen: FEN }),
    });

    expect(response.statusCode).toBe(200);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://belzedar.duckdns.org/atomicdb/api/request");
    expect(options).toMatchObject({ method: "POST" });
    expect(String(options.body)).toBe(
      new URLSearchParams({ fen: FEN, only_if_missing: "1" }).toString(),
    );
    expect(JSON.parse(response.body)).toMatchObject({
      task: 42,
      taskState: "waiting",
      budgetNodes: 128_000_000,
    });
  });

  it("rejects cross-site requests before contacting AtomicDB", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { handler } = await import("../functions/atomicdb-request");

    const response = await handler({
      httpMethod: "POST",
      headers: { host: "atomic.example", origin: "https://attacker.example" },
      body: JSON.stringify({ fen: FEN }),
    });

    expect(response.statusCode).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
