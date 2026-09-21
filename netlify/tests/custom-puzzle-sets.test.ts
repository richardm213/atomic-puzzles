import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/puzzle-sets";
import { createSiteSessionCookie } from "../lib/siteSession";

const setId = "4b648b2a-e2bf-49dc-aaed-235c05615d1b";

const createSupabaseMock = (completedAt: string | null) => {
  const setQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  setQuery.select = vi.fn(() => setQuery);
  setQuery.eq = vi.fn(() => setQuery);
  setQuery.maybeSingle = vi.fn(async () => ({
    data: {
      id: setId,
      name: "Review set",
      tag_filters: [],
      author_filter: null,
      created_at: "2026-09-21T00:00:00.000Z",
      updated_at: "2026-09-21T00:00:00.000Z",
    },
    error: null,
  }));

  const itemReadQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  itemReadQuery.select = vi.fn(() => itemReadQuery);
  itemReadQuery.in = vi.fn(() => itemReadQuery);
  itemReadQuery.order = vi.fn(() => itemReadQuery);
  itemReadQuery.range = vi.fn(async () => ({
    data: [
      {
        set_id: setId,
        puzzle_id: "1369",
        position: 0,
        completed_at: completedAt,
        last_result: completedAt ? true : null,
        attempt_count: completedAt ? 1 : 0,
      },
    ],
    error: null,
  }));

  const itemUpdateQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  itemUpdateQuery.eq = vi.fn(() => itemUpdateQuery);
  itemUpdateQuery.is = vi.fn(async () => ({ data: null, error: null }));

  const update = vi.fn(() => itemUpdateQuery);
  const from = vi.fn((table: string) => {
    if (table === "custom_puzzle_sets") return setQuery;
    return {
      select: itemReadQuery.select,
      update,
    };
  });
  mocks.createClient.mockReturnValue({ from });

  return { update, itemUpdateQuery };
};

const createRefreshSupabaseMock = () => {
  const setRow = {
    id: setId,
    name: "Fork review",
    tag_filters: ["fork"],
    author_filter: null,
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
  };
  const setLookupQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  setLookupQuery.select = vi.fn(() => setLookupQuery);
  setLookupQuery.eq = vi.fn(() => setLookupQuery);
  setLookupQuery.maybeSingle = vi.fn(async () => ({ data: setRow, error: null }));

  const itemReadQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  itemReadQuery.select = vi.fn(() => itemReadQuery);
  itemReadQuery.in = vi.fn(() => itemReadQuery);
  itemReadQuery.order = vi.fn(() => itemReadQuery);
  itemReadQuery.range = vi.fn(async () => ({
    data: [
      {
        set_id: setId,
        puzzle_id: "1369",
        position: 0,
        completed_at: "2026-09-21T01:00:00.000Z",
        last_result: true,
        attempt_count: 1,
      },
    ],
    error: null,
  }));

  const progressQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  progressQuery.select = vi.fn(() => progressQuery);
  progressQuery.eq = vi.fn(() => progressQuery);
  progressQuery.order = vi.fn(() => progressQuery);
  progressQuery.range = vi.fn(async () => ({
    data: [
      { puzzle_id: "1369", puzzle_correct: true },
      { puzzle_id: "1370", puzzle_correct: false },
    ],
    error: null,
  }));

  const puzzleQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  puzzleQuery.select = vi.fn(() => puzzleQuery);
  puzzleQuery.in = vi.fn(async () => ({
    data: [
      { id: 1369, author: "admin", tags: ["fork"] },
      { id: 1370, author: "admin", tags: ["fork"] },
    ],
    error: null,
  }));

  const insertItems = vi.fn(async () => ({ data: null, error: null }));
  const setUpdateQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  setUpdateQuery.eq = vi.fn(() => setUpdateQuery);
  setUpdateQuery.select = vi.fn(() => setUpdateQuery);
  setUpdateQuery.single = vi.fn(async () => ({
    data: { ...setRow, updated_at: "2026-09-21T02:00:00.000Z" },
    error: null,
  }));
  const updateSet = vi.fn(() => setUpdateQuery);

  mocks.createClient.mockReturnValue({
    from: vi.fn((table: string) => {
      if (table === "custom_puzzle_sets") {
        return { select: setLookupQuery.select, update: updateSet };
      }
      if (table === "custom_puzzle_set_items") {
        return { select: itemReadQuery.select, insert: insertItems };
      }
      if (table === "puzzle_progress") return { select: progressQuery.select };
      return { select: puzzleQuery.select };
    }),
  });

  return { insertItems };
};

const recordRequest = (puzzleCorrect: boolean) => {
  const cookie = createSiteSessionCookie("Solver", {});
  return handler({
    httpMethod: "POST",
    headers: { cookie: cookie.split(";")[0] },
    body: JSON.stringify({
      action: "record",
      id: setId,
      puzzleId: "1369",
      puzzleCorrect,
    }),
  });
};

describe("custom puzzle set progress", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv(
      "SITE_SESSION_SECRET",
      "test-session-secret-that-is-longer-than-thirty-two-characters",
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("records the first attempt made after the custom set was created", async () => {
    const { update, itemUpdateQuery } = createSupabaseMock(null);

    const response = await recordRequest(false);

    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith({
      completed_at: expect.any(String),
      last_result: false,
      attempt_count: 1,
    });
    expect(itemUpdateQuery.is).toHaveBeenCalledWith("completed_at", null);
  });

  it("does not overwrite an existing custom-set attempt", async () => {
    const { update } = createSupabaseMock("2026-09-21T01:00:00.000Z");

    const response = await recordRequest(false);

    expect(response.statusCode).toBe(200);
    expect(update).not.toHaveBeenCalled();
  });

  it("removes a puzzle without deleting its custom-set attempt history", async () => {
    const { update, itemUpdateQuery } = createSupabaseMock("2026-09-21T01:00:00.000Z");
    const cookie = createSiteSessionCookie("Solver", {});

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({
        action: "remove-item",
        id: setId,
        puzzleId: "1369",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith({ removed_at: expect.any(String) });
    expect(itemUpdateQuery.is).toHaveBeenCalledWith("removed_at", null);
    expect(JSON.parse(response.body ?? "{}")).toMatchObject({
      set: { puzzleIds: [], completedCount: 0 },
    });
  });

  it("appends newly matching puzzles without changing completed items", async () => {
    const { insertItems } = createRefreshSupabaseMock();
    const cookie = createSiteSessionCookie("Solver", {});

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({ action: "refresh", id: setId }),
    });

    expect(response.statusCode).toBe(200);
    expect(insertItems).toHaveBeenCalledWith([{ set_id: setId, puzzle_id: "1370", position: 1 }]);
    expect(JSON.parse(response.body ?? "{}")).toMatchObject({
      addedPuzzleIds: [1370],
      set: {
        puzzleIds: [1369, 1370],
        completedCount: 1,
        nextPuzzleId: 1370,
      },
    });
  });
});
