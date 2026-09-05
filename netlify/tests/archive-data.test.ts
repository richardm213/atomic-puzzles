import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), createClient: vi.fn() }));

vi.mock("@libsql/client/web", () => ({ createClient: mocks.createClient }));

describe("archive-data function", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.execute.mockReset();
    mocks.createClient.mockReset();
    mocks.createClient.mockReturnValue({ execute: mocks.execute });
    process.env.TURSO_MATCHES_DATABASE_URL = "libsql://matches.test";
    process.env.TURSO_MATCHES_AUTH_TOKEN = "read-only-test-token";
  });

  it("queries a match page without inventing missing numeric filters", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({
      rows: [
        {
          match_id: "abc12345",
          player_1: "alice",
          player_2: "bob",
          start_ts: 123,
          time_control: "3+0",
          source: "friend",
          tournament_id: null,
          games: "abc12345,w,1,1|def67890,b,1,2",
        },
      ],
    });
    const { handler } = await import("../functions/archive-data");
    const response = await handler({
      httpMethod: "GET",
      queryStringParameters: { resource: "matches", mode: "blitz", page: "1", pageSize: "25" },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.execute.mock.calls[0]?.[0].args).toEqual([2]);
    expect(JSON.parse(response.body)).toMatchObject({
      total: 1,
      rows: [{ games: ["abc12345,w,1,1", "def67890,b,1,2"] }],
    });
  });

  it("resolves usernames to player ids before querying the large match table", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ id: 42 }] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const { handler } = await import("../functions/archive-data");
    await handler({
      queryStringParameters: { resource: "matches", mode: "bullet", username: "Alice" },
    });

    expect(mocks.execute.mock.calls[0]?.[0]).toMatchObject({ args: ["alice"] });
    expect(mocks.execute.mock.calls[1]?.[0].args).toEqual([1, 42, 42]);
  });

  it("maps the complete source enum without treating invalid values as lobby", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });
    const { handler } = await import("../functions/archive-data");
    const response = await handler({
      queryStringParameters: { resource: "matches", mode: "blitz", sources: "unknown" },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.execute.mock.calls[0]?.[0].args).toEqual([2, 5]);

    const invalidResponse = await handler({
      queryStringParameters: { resource: "matches", mode: "blitz", sources: "invalid" },
    });
    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.headers["Cache-Control"]).toBe("no-store");
  });

  it("serves leaderboard history from the archive table", async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [{ username: "alice", month: "2026-08-01", rank: 1, tc: "blitz" }],
    });
    const { handler } = await import("../functions/archive-data");
    const response = await handler({
      httpMethod: "GET",
      queryStringParameters: {
        resource: "leaderboard",
        month: "2026-08-01",
        mode: "blitz",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining("from lb l"),
        args: ["2026-08-01", 2],
      }),
    );
    expect(JSON.parse(response.body)).toEqual([
      { username: "alice", month: "2026-08-01", rank: 1, tc: "blitz" },
    ]);
  });

  it("supports the normalized atomic960 mode id for rating reads", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    const { handler } = await import("../functions/archive-data");
    const response = await handler({
      queryStringParameters: { resource: "ratings", mode: "ATOMIC960" },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining("when 4 then 'atomic960'"),
        args: [4],
      }),
    );
  });

  it("requires both server-only Turso credentials", async () => {
    delete process.env.TURSO_MATCHES_AUTH_TOKEN;
    const { handler } = await import("../functions/archive-data");
    const response = await handler({
      httpMethod: "GET",
      queryStringParameters: { resource: "health" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.parse(response.body)).toEqual({ error: "Archive query failed" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
