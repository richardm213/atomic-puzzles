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
});
