import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { handler } from "../functions/puzzle-play";

const createPuzzleQuery = () => {
  const query = {
    select: vi.fn(),
    in: vi.fn(async () => ({
      data: [{ id: 414, fen: "puzzle fen", solution: "18. O-O-O" }],
      error: null,
    })),
  };
  query.select.mockReturnValue(query);
  return query;
};

describe("puzzle-play function", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("preserves the existing puzzle detail payload, including the solution", async () => {
    const query = createPuzzleQuery();
    mocks.createClient.mockReturnValue({ from: vi.fn(() => query) });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ puzzleIds: [414] }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["X-Puzzle-Details-Source"]).toBe("server");
    expect(JSON.parse(response.body)).toEqual({
      puzzles: [{ id: 414, fen: "puzzle fen", solution: "18. O-O-O" }],
    });
    expect(query.in).toHaveBeenCalledWith("id", [414]);
  });

  it("rejects cross-site puzzle detail requests", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: { origin: "https://attacker.example", host: "atomicpuzzles.org" },
      body: JSON.stringify({ puzzleIds: [414] }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects batches larger than the current prefetch limit", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ puzzleIds: Array.from({ length: 13 }, (_, index) => index + 1) }),
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
