import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { handler } from "../functions/puzzle-issues";
import { createSiteSessionCookie } from "../lib/siteSession";

const authHeaders = (username = "reporter") => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
});

describe("puzzle-issues function", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv(
      "SITE_SESSION_SECRET",
      "test-session-secret-that-is-longer-than-thirty-two-characters",
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("only accepts POST requests", async () => {
    const response = await handler({ httpMethod: "GET" });
    expect(response.statusCode).toBe(405);
  });

  it("requires login to report an issue", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "create", puzzleId: 42, category: "incorrect_solution" }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("requires details for the other category", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ action: "create", puzzleId: 42, category: "other", details: "" }),
    });
    expect(response.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects reports for puzzles the user has not attempted", async () => {
    const maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const secondEq = vi.fn(() => ({ maybeSingle }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const select = vi.fn(() => ({ eq: firstEq }));
    mocks.createClient.mockReturnValue({ from: vi.fn(() => ({ select })) });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ action: "create", puzzleId: 42, category: "incorrect_solution" }),
    });
    expect(response.statusCode).toBe(403);
  });

  it("restricts the issue list to the reviewer", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("someone_else"),
      body: JSON.stringify({ action: "list" }),
    });
    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
