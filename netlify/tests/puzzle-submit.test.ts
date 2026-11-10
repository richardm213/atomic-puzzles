import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  queryArchiveResource: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));
vi.mock("../archive/queries", () => ({
  queryArchiveResource: mocks.queryArchiveResource,
}));

import { handler } from "../functions/puzzle-submit";
import { createSiteSessionCookie } from "../lib/siteSession";

const authHeaders = (username = "submitter") => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
});

describe("puzzle-submit function", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.queryArchiveResource.mockReset();
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

  it("requires a signed site session", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ fen: "fen", solution: "move", explanation: "" }),
    });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body)).toEqual({
      error: "Log in with Lichess to submit a puzzle.",
      code: "unauthorized",
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

  it("looks up a playable puzzle by position, not by the FEN move counters", async () => {
    const position = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
    const query = {
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: { id: 42 }, error: null })),
    };
    const from = vi.fn(() => query);
    mocks.createClient.mockReturnValue({ from });
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ action: "starting-fen-match", fen: `${position} 15 31` }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ puzzleId: 42 });
    expect(from).toHaveBeenCalledExactlyOnceWith("puzzles");
    expect(query.is).toHaveBeenCalledWith("deleted_at", null);
    expect(query.eq).toHaveBeenCalledWith("has_solution", true);
    const [column, operator, pattern] = query.filter.mock.calls[0] ?? [];
    expect([column, operator]).toEqual(["fen", "match"]);
    const matches = new RegExp(String(pattern).replaceAll("[[:space:]]", "\\s"));
    expect(matches.test(`${position} 0 1`)).toBe(true);
    expect(matches.test(position.replace(" w ", " b "))).toBe(false);
  });

  it("does not accept an invalid match request as a standalone puzzle", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        action: "add-match-puzzle",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. e4",
        explanation: "",
      }),
    });
    expect(response.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("reports an unavailable archive as a lookup failure before any puzzle write", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const rpc = vi.fn();
      mocks.createClient.mockReturnValue({ rpc });
      mocks.queryArchiveResource.mockRejectedValue(new Error("Archive server returned 404"));

      const response = await handler({
        httpMethod: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ action: "match-context", gameId: "game-1" }),
      });

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toEqual({
        error: "Unable to load the match set. Try again.",
        code: "internal_error",
      });
      expect(rpc).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it.each([
    { username: "submitter", setName: "Scam match", publish: false, source: "linked", setId: 42 },
    {
      username: "submitter",
      setName: "Match match-1",
      renameTo: "Alice and Bob",
      publish: false,
      source: "linked",
      setId: 42,
    },
    {
      username: "submitter",
      setName: "Older match",
      publish: false,
      source: "historical",
      setId: 43,
    },
    {
      username: "wolfram_ep",
      setName: "AWC 2026 Semifinals",
      publish: true,
      source: "tournament",
      setId: null,
    },
    {
      username: "wolfram_ep",
      setName: "AWC 2026 Semifinals · match-1",
      publish: true,
      source: "tournament-linked",
      setId: 44,
    },
  ])(
    "uses $source match metadata for '$setName'",
    async ({ username, setName, publish, source, setId, renameTo }) => {
      let storedSetName = setName;
      mocks.queryArchiveResource.mockResolvedValue({
        external_match_id: "match-1",
        player_1: "alice",
        player_2: "bob",
        result: 1,
        start_ts: Date.UTC(2026, 10, 9),
        tournament: null,
      });
      const roundQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data: !source.startsWith("tournament")
            ? null
            : {
                tournament: "awc2026",
                bracket: "main",
                round: "Semifinals",
                played_on: "2026-11-09",
              },
          error: null,
        })),
      };
      const setQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn(async () => ({
          data:
            source === "linked" || source === "tournament-linked"
              ? [{ id: setId, event_name: storedSetName, source_id: "match-1" }]
              : [],
          error: null,
        })),
      };
      const historicalQuery = {
        select: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({
          data:
            source === "historical"
              ? {
                  event: null,
                  event_name: setName,
                  puzzle_set: { id: setId, event_name: setName, source_id: null },
                }
              : null,
          error: null,
        })),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: [], error: null }),
      };
      const from = vi.fn((table: string) => {
        if (table === "puzzle_sets") return setQuery;
        if (table === "puzzles") return historicalQuery;
        if (table === "tournament_matches") return roundQuery;
        if (table === "tournament_catalog") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn(async () => ({ data: { title: "AWC 2026" }, error: null })),
          };
        }
        return { upsert: vi.fn(async () => ({ error: null })) };
      });
      const savedName = renameTo ?? setName;
      const result = publish
        ? { destination: "published", setName: savedName, puzzleId: 1801 }
        : { destination: "review", setName: savedName };
      const rpc = vi.fn(async () => ({ data: result, error: null }));
      mocks.createClient.mockReturnValue({ from, rpc });

      const preview = await handler({
        httpMethod: "POST",
        headers: authHeaders(username),
        body: JSON.stringify({ action: "match-context", gameId: "game-1" }),
      });
      expect(preview.statusCode).toBe(200);
      expect(JSON.parse(preview.body)).toMatchObject({ setName, canRenameSet: Boolean(renameTo) });
      expect(rpc).not.toHaveBeenCalled();

      const submitMatch = (
        matchName: string,
        renameFrom?: string,
        creator = username,
        gameId = "game-1",
      ) =>
        handler({
          httpMethod: "POST",
          headers: authHeaders(creator),
          body: JSON.stringify({
            action: "add-match-puzzle",
            gameId,
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            solution: "1. e4",
            explanation: "",
            matchName,
            renameFrom,
            whitePlayer: "spoofed",
          }),
        });
      if (!renameTo) {
        const forbidden = await submitMatch("Not allowed", setName);
        expect(forbidden.statusCode).toBe(409);
        expect(rpc).not.toHaveBeenCalled();
      }
      const response = await submitMatch(
        renameTo ?? "Ignored name",
        renameTo ? setName : undefined,
      );
      expect(response.statusCode).toBe(201);
      expect(JSON.parse(response.body)).toEqual(result);
      expect(rpc).toHaveBeenCalledWith(
        "save_match_puzzle",
        expect.objectContaining({
          p_game_id: "game-1",
          p_match_id: "match-1",
          p_legacy_set_id: setId,
          p_publish: publish,
          ...(renameTo ? { p_rename_from: setName } : {}),
          p_puzzle: expect.objectContaining({
            eventName: savedName,
            eventDate: "2026-11-09",
            whitePlayer: "bob",
            blackPlayer: "alice",
            players: ["alice", "bob"],
          }),
        }),
      );

      if (renameTo) {
        // Simulate the canonical set after the first creator's queued puzzle saves its name.
        storedSetName = renameTo;
        const otherCreator = "wolfram_ep";
        const otherGameId = "game-2";
        const otherPreview = await handler({
          httpMethod: "POST",
          headers: authHeaders(otherCreator),
          body: JSON.stringify({ action: "match-context", gameId: otherGameId }),
        });
        expect(otherPreview.statusCode).toBe(200);
        expect(JSON.parse(otherPreview.body)).toMatchObject({
          setName: renameTo,
          canRenameSet: false,
        });
        rpc.mockResolvedValueOnce({
          data: { destination: "published", puzzleId: 1802, setName: renameTo },
          error: null,
        });
        const otherSubmission = await submitMatch(setName, undefined, otherCreator, otherGameId);
        expect(otherSubmission.statusCode).toBe(201);
        expect(rpc).toHaveBeenLastCalledWith(
          "save_match_puzzle",
          expect.objectContaining({
            p_submitted_by: otherCreator,
            p_game_id: otherGameId,
            p_match_id: "match-1",
            p_legacy_set_id: setId,
            p_publish: true,
            p_puzzle: expect.objectContaining({ eventName: renameTo }),
          }),
        );
      }
    },
  );

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

  it("uses optional player colors as participants while leaving event metadata blank", async () => {
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
        tags: ["fork"],
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(rpc).toHaveBeenCalledWith("enqueue_puzzle_submission", {
      p_fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      p_solution: "1. e4",
      p_event: "Community event",
      p_event_name: "",
      p_event_date: "",
      p_players: ["black", "white"],
      p_white_player: "white",
      p_black_player: "black",
      p_explanation: "",
      p_opa_style: false,
      p_author: "submitter",
      p_submitted_by: "submitter",
      p_tags: ["fork"],
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
          author: "maracker",
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
          p_allow_different_start_move: false,
          p_puzzles: [
            expect.objectContaining({
              solution: "1. e4",
              author: username === "seaside_tiramisu" ? "maracker" : username,
            }),
          ],
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
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2",
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
          expect.objectContaining({ solution: "2. e4" }),
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
      code: "conflict",
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
      code: "conflict",
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
    expect(JSON.parse(response.body).error).toMatch(/Continue with this submission/);
    expect(rpc).toHaveBeenCalledWith(
      "enqueue_puzzle_submission",
      expect.objectContaining({ p_allow_different_start_move: false }),
    );
  });

  it("publishes a confirmed different starting move directly for seaside_tiramisu's chosen author", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const rpc = vi.fn(async () => ({ data: [1802], error: null }));
    const from = vi.fn(() => ({ upsert }));
    mocks.createClient.mockReturnValue({ from, rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("seaside_tiramisu"),
      body: JSON.stringify({
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "1. d4",
        explanation: "",
        author: "maracker",
        allowDifferentStartMove: true,
      }),
    });

    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({
      destination: "published",
      puzzleId: 1802,
    });
    expect(rpc).toHaveBeenCalledWith(
      "publish_approved_puzzle_batch",
      expect.objectContaining({
        p_submitted_by: "seaside_tiramisu",
        p_allow_different_start_move: true,
        p_puzzles: [expect.objectContaining({ author: "maracker" })],
      }),
    );
    expect(rpc).not.toHaveBeenCalledWith("enqueue_puzzle_submission", expect.anything());
  });
});
