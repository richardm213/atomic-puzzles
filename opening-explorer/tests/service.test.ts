import { describe, expect, it, vi } from "vitest";

import { createOpeningExplorerQueue, OpeningExplorerQueueError } from "../core/requestQueue.js";
import {
  createOpeningExplorerService,
  type JsonRow,
  type OpeningExplorerRepository,
} from "../core/service.js";

const FEN = "8/8/8/8/8/8/8/K6k w - - 0 1";

const responseBody = (response: { body: string }) =>
  JSON.parse(response.body) as Record<string, unknown>;

const createRepository = (
  query: (sql: string) => Promise<JsonRow[]>,
  available = true,
): OpeningExplorerRepository => ({
  source: "fixture",
  availability: () => ({ available, message: "fixture unavailable" }),
  signature: () => "fixture:v1",
  query: (sql) => query(sql),
});

const fixtureQuery = async (sql: string): Promise<JsonRow[]> => {
  if (sql.includes("key = 'aliases'")) return [{ value: '{"alias":"canonical"}' }];
  if (sql.includes("opening_position_player_leaders")) return [];
  if (sql.includes("position_player_leader_bands")) return [];
  if (sql.includes("savedGames")) return [{ savedGames: 0, savedRecentGames: 0 }];
  if (sql.includes("select n.name as username")) return [{ username: "alice" }, { username: "" }];
  if (sql.includes("order by random")) return [{ username: "random-user" }];
  if (sql.includes("limit 12")) {
    return [{ uci: "a1a2", games: 1_000, whiteWins: 400, draws: 200, blackWins: 400 }];
  }
  if (sql.includes("limit 8")) return [{ gameId: "g1", uci: "a1a2" }];
  return [];
};

const explorerRequest = (extra: Record<string, string> = {}) => ({
  path: "/api/opening-explorer",
  params: new URLSearchParams({ fen: FEN, ...extra }),
});

describe("createOpeningExplorerService", () => {
  it("reports health while unavailable but rejects data requests without querying", async () => {
    const query = vi.fn(fixtureQuery);
    const service = createOpeningExplorerService(createRepository(query, false));

    const health = await service.handle({
      path: "/api/opening-explorer/health",
      params: new URLSearchParams(),
    });
    expect(health.statusCode).toBe(200);
    expect(responseBody(health)).toMatchObject({ ok: true, configured: false, source: "fixture" });

    const explorer = await service.handle(explorerRequest());
    expect(explorer.statusCode).toBe(503);
    expect(responseBody(explorer)).toEqual({ error: "fixture unavailable" });
    expect(query).not.toHaveBeenCalled();
  });

  it("serves player discovery endpoints and returns 404 when no random player exists", async () => {
    const service = createOpeningExplorerService(createRepository(fixtureQuery));
    const players = await service.handle({
      path: "/api/opening-players",
      params: new URLSearchParams(),
    });
    expect(responseBody(players)).toEqual({ players: ["alice"] });

    const emptyRandomService = createOpeningExplorerService(
      createRepository(async (sql) => (sql.includes("order by random") ? [] : fixtureQuery(sql))),
    );
    const random = await emptyRandomService.handle({
      path: "/api/opening-explorer",
      params: new URLSearchParams({ randomPlayer: "1" }),
    });
    expect(random.statusCode).toBe(404);
    expect(responseBody(random)).toEqual({ error: "No opening database players are available" });
  });

  it("resolves aliases once per database signature before building personalized SQL", async () => {
    const queries: string[] = [];
    const service = createOpeningExplorerService(
      createRepository(async (sql) => {
        queries.push(sql);
        return fixtureQuery(sql);
      }),
    );

    await service.handle(explorerRequest({ username: "alias", opponent: "alias" }));
    await service.handle(explorerRequest({ username: "alias", color: "white" }));

    expect(queries.filter((sql) => sql.includes("key = 'aliases'"))).toHaveLength(1);
    const explorerSql = queries.filter(
      (sql) => sql.includes("limit 12") || sql.includes("limit 8"),
    );
    expect(explorerSql.every((sql) => sql.includes("canonical"))).toBe(true);
    expect(explorerSql.every((sql) => !sql.includes("'alias'"))).toBe(true);
  });

  it("caches general and personalized responses without making personalized data public", async () => {
    const query = vi.fn(fixtureQuery);
    const service = createOpeningExplorerService(createRepository(query));

    const first = await service.handle(explorerRequest());
    const callsAfterFirst = query.mock.calls.length;
    const second = await service.handle(explorerRequest());
    expect(second.body).toBe(first.body);
    expect(query).toHaveBeenCalledTimes(callsAfterFirst);
    expect(second.headers["Cache-Control"]).toBe("public, max-age=30");

    await service.handle(explorerRequest({ username: "alice" }));
    const callsAfterPersonalized = query.mock.calls.length;
    const personalized = await service.handle(explorerRequest({ username: "alice" }));
    expect(query.mock.calls.length).toBe(callsAfterPersonalized);
    expect(personalized.headers["Cache-Control"]).toBe("no-store");
  });

  it("caches small and empty results, isolates filters, and expires entries", async () => {
    let now = 1000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const query = vi.fn(async (sql: string) =>
        sql.includes("limit 12") ? [] : fixtureQuery(sql),
      );
      const service = createOpeningExplorerService(createRepository(query));
      await service.handle(explorerRequest({ speeds: "0" }));
      const firstCalls = query.mock.calls.length;
      await service.handle(explorerRequest({ speeds: "0" }));
      expect(query).toHaveBeenCalledTimes(firstCalls);
      await service.handle(explorerRequest({ speeds: "1" }));
      expect(query.mock.calls.length).toBeGreaterThan(firstCalls);
      expect(
        query.mock.calls.filter(([sql]) => sql.includes("position_player_leader_bands")),
      ).toHaveLength(1);
      const beforeExpiry = query.mock.calls.length;
      now += 60_001;
      await service.handle(explorerRequest({ speeds: "0" }));
      expect(query.mock.calls.length).toBeGreaterThan(beforeExpiry);
      expect(
        query.mock.calls.filter(([sql]) => sql.includes("position_player_leader_bands")),
      ).toHaveLength(2);
    } finally {
      clock.mockRestore();
    }
  });

  it("batches the two main reads with no saved-status round trip", async () => {
    const query = vi.fn(fixtureQuery);
    const queryBatch = vi.fn(async (statements: string[]) =>
      Promise.all(statements.map(fixtureQuery)),
    );
    const service = createOpeningExplorerService({ ...createRepository(query), queryBatch });
    const response = await service.handle(explorerRequest());
    expect(response.statusCode).toBe(200);
    expect(queryBatch).toHaveBeenCalledTimes(1);
    expect(queryBatch.mock.calls[0]![0]).toHaveLength(2);
    expect(query.mock.calls.every(([sql]) => !sql.includes("savedGames"))).toBe(true);
  });

  it("coalesces duplicate in-flight requests and retries after a failure", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("limit 12")) {
        await gate;
      }
      return fixtureQuery(sql);
    });
    const service = createOpeningExplorerService(createRepository(query));

    const first = service.handle(explorerRequest({ username: "alice" }));
    const duplicate = service.handle(explorerRequest({ username: "alice" }));
    release();
    const [firstResponse, duplicateResponse] = await Promise.all([first, duplicate]);
    expect(firstResponse.statusCode).toBe(200);
    expect(duplicateResponse.body).toBe(firstResponse.body);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes("limit 12"))).toHaveLength(1);

    let shouldFail = true;
    const retryService = createOpeningExplorerService(
      createRepository(async (sql) => {
        if (sql.includes("limit 12") && shouldFail) throw new Error("temporary database failure");
        return fixtureQuery(sql);
      }),
    );
    const failure = await retryService.handle(explorerRequest({ username: "alice" }));
    expect(failure.statusCode).toBe(500);
    shouldFail = false;
    const retry = await retryService.handle(explorerRequest({ username: "alice" }));
    expect(retry.statusCode).toBe(200);
  });

  it("preserves queue status codes and hides non-Error failures", async () => {
    const busyService = createOpeningExplorerService(
      createRepository(async () => {
        throw new OpeningExplorerQueueError("busy", 429);
      }),
    );
    const busy = await busyService.handle({
      path: "/api/opening-players",
      params: new URLSearchParams(),
    });
    expect(busy.statusCode).toBe(429);
    expect(responseBody(busy)).toEqual({ error: "busy" });

    const opaqueFailureService = createOpeningExplorerService(
      createRepository(async () => {
        // Deliberately exercise the service's defensive branch for non-Error rejections.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        return Promise.reject("secret backend detail");
      }),
    );
    const failure = await opaqueFailureService.handle({
      path: "/api/opening-players",
      params: new URLSearchParams(),
    });
    expect(failure.statusCode).toBe(500);
    expect(responseBody(failure)).toEqual({ error: "Opening explorer query failed" });
  });
  it("drops superseded navigation jobs without cancelling another tab", async () => {
    const queue = createOpeningExplorerQueue({ maxConcurrent: 1, maxQueued: 10 });
    let unblock!: () => void;
    const blocker = queue.enqueue(
      () =>
        new Promise<void>((resolve) => {
          unblock = resolve;
        }),
      { value: 0 },
    );
    let runs = 0;
    const service = createOpeningExplorerService({
      ...createRepository(fixtureQuery),
      queryBatch: (statements, priority) =>
        queue.enqueue(async () => {
          runs += 1;
          return Promise.all(statements.map(fixtureQuery));
        }, priority),
    });
    const first = service.handle({
      ...explorerRequest({ speeds: "0" }),
      navigation: { session: "tab-a", sequence: 1 },
    });
    await vi.waitFor(() => expect(queue.stats().queued).toBe(1));
    const latest = service.handle({
      ...explorerRequest({ speeds: "1" }),
      navigation: { session: "tab-a", sequence: 2 },
    });
    expect((await first).statusCode).toBe(409);
    const other = service.handle({
      ...explorerRequest({ speeds: "1" }),
      navigation: { session: "tab-b", sequence: 1 },
    });
    await vi.waitFor(() => expect(queue.stats().queued).toBe(2));
    unblock();
    await blocker;
    expect((await latest).statusCode).toBe(200);
    expect((await other).statusCode).toBe(200);
    expect(runs).toBe(2);
    const late = await service.handle({
      ...explorerRequest({ speeds: "0" }),
      navigation: { session: "tab-a", sequence: 1 },
    });
    expect(late.statusCode).toBe(409);
    expect(runs).toBe(2);
  });

  it("does not cache a late result from a disconnected request", async () => {
    let resolve!: (rows: JsonRow[][]) => void;
    const queryBatch = vi.fn(
      () =>
        new Promise<JsonRow[][]>((r) => {
          resolve = r;
        }),
    );
    const service = createOpeningExplorerService({ ...createRepository(fixtureQuery), queryBatch });
    const controller = new AbortController();
    const first = service.handle({ ...explorerRequest(), signal: controller.signal });
    await vi.waitFor(() => expect(queryBatch).toHaveBeenCalledTimes(1));
    controller.abort();
    expect((await first).statusCode).toBe(499);
    resolve([[], []]);
    await Promise.resolve();
    const retry = service.handle(explorerRequest());
    await vi.waitFor(() => expect(queryBatch).toHaveBeenCalledTimes(2));
    resolve([[], []]);
    expect((await retry).statusCode).toBe(200);
  });
});
