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

  it("stores uploaded solution movetext on one readable line", async () => {
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
    const single = vi.fn(async () => ({ data: { id: 4 }, error: null }));
    const rpc = vi.fn(() => ({ single }));
    const from = vi.fn(() => ({ upsert }));
    mocks.createClient.mockReturnValue({ from, rpc });

    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        fen,
        solution: `1. e4\n(1. d4 d5)\ne5`,
        explanation: "",
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      "enqueue_puzzle_submission",
      expect.objectContaining({ p_solution: "1. e4 (1. d4 d5) e5" }),
    );
  });

  it("returns a clear conflict when the FEN and moves already exist", async () => {
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
      error: { message: "Puzzle moves already exist for FEN" },
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
      error: "A puzzle with this FEN and the same moves already exists.",
    });
  });

  it("returns a clear conflict when the FEN and moves are already in the review queue", async () => {
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
      error: { message: "Puzzle moves already exist for FEN in queue" },
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
      error: "A puzzle with this FEN and the same moves is already pending review.",
    });
  });
});
