import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/puzzle-submit";
import { createSiteSessionCookie } from "../lib/siteSession";

const authHeaders = (username = "submitter") => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
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
      expect.objectContaining({
        p_solution: "1. e4 (1. d4 d5) e5",
        p_event_name: "",
        p_event_date: "",
        p_players: [],
        p_white_player: "",
        p_black_player: "",
      }),
    );
  });

  it("stores optional player colors while leaving puzzle-set metadata blank", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const single = vi.fn(async () => ({ data: { id: 5 }, error: null }));
    const rpc = vi.fn(() => ({ single }));
    const from = vi.fn(() => ({ upsert }));
    mocks.createClient.mockReturnValue({ from, rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. e4",
        event: "Community event",
        eventName: "ignored",
        eventDate: "2026-09",
        players: ["white", "black"],
        whitePlayer: "white",
        blackPlayer: "black",
        explanation: "",
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(rpc).toHaveBeenCalledWith("enqueue_puzzle_submission", {
      p_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      p_solution: "1. e4",
      p_event: "Community event",
      p_event_name: "",
      p_event_date: "",
      p_players: [],
      p_white_player: "white",
      p_black_player: "black",
      p_explanation: "",
      p_submitted_by: "submitter",
      p_allow_different_start_move: false,
    });
  });

  it.each(["seaside_tiramisu", "wolfram_ep", "randoomplayer"])(
    "publishes approved creator %s directly and returns the new puzzle id",
    async (username) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ username }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }),
        ),
      );
      const upsert = vi.fn(async () => ({ error: null }));
      const rpc = vi.fn(async () => ({ data: [1801], error: null }));
      const from = vi.fn(() => ({ upsert }));
      mocks.createClient.mockReturnValue({ from, rpc });

      const response = await handler({
        httpMethod: "POST",
        headers: authHeaders(username),
        body: JSON.stringify({
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          solution: "1. e4",
          explanation: "",
        }),
      });

      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toEqual({
        destination: "published",
        puzzleId: 1801,
      });
      expect(rpc).toHaveBeenCalledWith(
        "publish_approved_puzzle_batch",
        expect.objectContaining({
          p_submitted_by: username,
          p_puzzles: [expect.objectContaining({ solution: "1. e4" })],
        }),
      );
      expect(rpc).not.toHaveBeenCalledWith("enqueue_puzzle_submission", expect.anything());
    },
  );

  it("publishes an approved creator batch in one database transaction", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const rpc = vi.fn(async () => ({ data: [1801, 1802], error: null }));
    const from = vi.fn(() => ({ upsert }));
    mocks.createClient.mockReturnValue({ from, rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("wolfram_ep"),
      body: JSON.stringify({
        submissions: [
          {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            solution: "1. e4",
            explanation: "",
          },
          {
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            solution: "1. d4",
            explanation: "",
          },
        ],
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({
      destination: "published",
      puzzleIds: [1801, 1802],
    });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(
      "publish_approved_puzzle_batch",
      expect.objectContaining({
        p_submitted_by: "wolfram_ep",
        p_puzzles: [
          expect.objectContaining({ solution: "1. e4" }),
          expect.objectContaining({ solution: "1. d4" }),
        ],
      }),
    );
  });

  it("does not let an ordinary signed-in user impersonate an approved creator in the body", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const single = vi.fn(async () => ({ data: { id: 4 }, error: null }));
    const rpc = vi.fn(() => ({ single }));
    const from = vi.fn(() => ({ upsert }));
    mocks.createClient.mockReturnValue({ from, rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("submitter"),
      body: JSON.stringify({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. e4",
        explanation: "",
        username: "wolfram_ep",
        submitted_by: "wolfram_ep",
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      "enqueue_puzzle_submission",
      expect.objectContaining({ p_submitted_by: "submitter" }),
    );
    expect(rpc).not.toHaveBeenCalledWith("publish_approved_puzzle_batch", expect.anything());
  });

  it("returns a clear conflict when the FEN and starting move already exist", async () => {
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
      error: "A puzzle with this FEN and starting move already exists.",
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
      error: "A puzzle with this FEN and starting move is already pending review.",
    });
  });

  it("asks before queueing a different starting move from the same FEN", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const single = vi.fn(async () => ({
      data: null,
      error: { message: "Puzzle FEN exists with different start move" },
    }));
    const rpc = vi.fn(() => ({ single }));
    const from = vi.fn(() => ({ upsert }));
    mocks.createClient.mockReturnValue({ from, rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. d4",
        explanation: "",
      }),
    });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error).toMatch(/Send this puzzle to the review queue/);
    expect(rpc).toHaveBeenCalledWith(
      "enqueue_puzzle_submission",
      expect.objectContaining({ p_allow_different_start_move: false }),
    );
  });

  it("routes a confirmed different starting move to review for an approved creator", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const single = vi.fn(async () => ({ data: { id: 9 }, error: null }));
    const rpc = vi.fn(() => ({ single }));
    const from = vi.fn(() => ({ upsert }));
    mocks.createClient.mockReturnValue({ from, rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("wolfram_ep"),
      body: JSON.stringify({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. d4",
        explanation: "",
        allowDifferentStartMove: true,
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({
      destination: "review",
      puzzle: { id: 9 },
    });
    expect(rpc).toHaveBeenCalledWith(
      "enqueue_puzzle_submission",
      expect.objectContaining({ p_allow_different_start_move: true }),
    );
    expect(rpc).not.toHaveBeenCalledWith("publish_approved_puzzle_batch", expect.anything());
  });
});
