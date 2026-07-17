import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/puzzle-progress";
import { createSiteSessionCookie } from "../lib/siteSession";

describe("puzzle-progress function", () => {
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
    vi.unstubAllGlobals();
  });

  it("requires a signed site session", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ puzzleId: "42", puzzleCorrect: true }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects malformed progress values before reading the session", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ puzzleId: "42", puzzleCorrect: "yes" }),
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("takes the progress owner from the signed session, never the request body", async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockReturnValue({ rpc });
    const cookie = createSiteSessionCookie("Actual_Solver", {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({
        username: "impersonated-victim",
        puzzleId: "42",
        puzzleCorrect: false,
        incorrectMove: "2. Nf3+",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(rpc).toHaveBeenCalledWith("record_first_puzzle_attempt", {
      p_username: "actual_solver",
      p_puzzle_id: "42",
      p_puzzle_correct: false,
      p_incorrect_move: "2. Nf3+",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not write progress for a tampered site cookie", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: "atomic_session=tampered" },
      body: JSON.stringify({ puzzleId: "42", puzzleCorrect: true }),
    });

    expect(response.statusCode).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-site progress mutations before reading the session", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: { host: "atomic.example", origin: "https://evil.example" },
      body: JSON.stringify({ puzzleId: "42", puzzleCorrect: true }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
