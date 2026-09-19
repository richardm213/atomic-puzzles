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

  it("serves scaled weekly aggregates without monthly eligibility or completed-week filters", async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [
        { username: "alice", week: "2026-09-20", rating: 1800.5, rd: 59.9, games: 1, tc: "blitz" },
      ],
    });
    const { handler } = await import("../functions/archive-data");
    const response = await handler({
      queryStringParameters: { resource: "weekly_ratings", username: " Alice ", mode: "blitz" },
    });
    expect(response.statusCode).toBe(200);
    const query = mocks.execute.mock.calls[0]![0];
    expect(query.args).toEqual(["alice", 2]);
    expect(query.sql).toContain("weekly_ratings");
    expect(query.sql).toContain("r.rating/10.0");
    expect(query.sql).toContain("r.rd/10.0");
    expect(query.sql).not.toMatch(/r.games\s*[><=]|r.week\s*[><=]/);
    expect(JSON.parse(response.body)).toEqual([
      { username: "alice", week: "2026-09-20", rating: 1800.5, rd: 59.9, games: 1, tc: "blitz" },
    ]);
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
    expect(mocks.execute.mock.calls[1]?.[0]).toMatchObject({
      args: [1, 42, 1, 42, 42],
      sql: expect.stringContaining("union all"),
    });
    expect(mocks.execute.mock.calls[2]?.[0]).toMatchObject({
      args: [1, 42, 1, 42, 42, 100, 0],
      sql: expect.stringContaining("order by start_ts desc"),
    });
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

  it.each([1726177800000, null])(
    "returns the latest match timestamp, including an empty archive (%s)",
    async (timestamp) => {
      mocks.execute.mockResolvedValueOnce({ rows: [{ start_ts: timestamp }] });
      const { handler } = await import("../functions/archive-data");
      const response = await handler({
        queryStringParameters: { resource: "latest_match" },
      });
      expect(response.statusCode).toBe(200);
      expect(mocks.execute).toHaveBeenCalledWith("select max(start_ts) as start_ts from matches");
      expect(JSON.parse(response.body)).toEqual({ start_ts: timestamp });
    },
  );

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

  it("serves yearly rankings without RD", async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [{ username: "alice", year: 2026, rank: 1, rating: 2100, games: 151, tc: "blitz" }],
    });
    const { handler } = await import("../functions/archive-data");
    const response = await handler({
      queryStringParameters: { resource: "yearly_leaderboard", year: "2026", mode: "blitz" },
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringContaining("from yearly_lb l"),
        args: [2026, 2],
      }),
    );
    expect(mocks.execute.mock.calls[0]![0].sql).not.toContain("l.rd");
    expect(JSON.parse(response.body)).toEqual([
      { username: "alice", year: 2026, rank: 1, rating: 2100, games: 151, tc: "blitz" },
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
