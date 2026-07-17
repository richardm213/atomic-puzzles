import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/puzzle-submit";
import { createSiteSessionCookie } from "../lib/siteSession";

const authHeaders = () => ({
  cookie: createSiteSessionCookie("submitter", {}).split(";")[0],
});

describe("puzzle-submit function", () => {
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
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("only accepts POST requests", async () => {
    const response = await handler({ httpMethod: "GET" });
    expect(response.statusCode).toBe(405);
  });

  it("requires a signed site session", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ fen: "fen", solution: "move", explanation: "" }),
    });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: "Log in with Lichess to submit a puzzle.",
    });
  });

  it("rejects malformed submissions before contacting external services", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: "{}",
    });
    expect(response.statusCode).toBe(400);
  });

  it("rejects unnumbered move text before verifying the access token", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "e4 e5",
        explanation: "",
      }),
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatch(/PGN/);
  });

  it("returns a clear conflict when the FEN already exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ username: "submitter" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const upsert = vi.fn(async () => ({ error: null }));
    const single = vi.fn(async () => ({
      data: null,
      error: { message: "Puzzle FEN already exists" },
    }));
    const rpc = vi.fn(() => ({ single }));
    const from = vi.fn(() => ({ upsert }));
    mocks.createClient.mockReturnValue({ from, rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. e4",
        explanation: "",
      }),
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toEqual({
      error: "A puzzle with this FEN already exists.",
    });
  });

  it("returns a clear conflict when the FEN is already in the review queue", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ username: "submitter" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const upsert = vi.fn(async () => ({ error: null }));
    const single = vi.fn(async () => ({
      data: null,
      error: { message: "Puzzle FEN already exists in queue" },
    }));
    const rpc = vi.fn(() => ({ single }));
    const from = vi.fn(() => ({ upsert }));
    mocks.createClient.mockReturnValue({ from, rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. e4",
        explanation: "",
      }),
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toEqual({
      error: "A puzzle with this FEN is already pending review.",
    });
  });
});
