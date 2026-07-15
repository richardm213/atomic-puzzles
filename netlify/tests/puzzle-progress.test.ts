import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/puzzle-progress";

describe("puzzle-progress function", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires a valid bearer token", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ puzzleId: "42", puzzleCorrect: true }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("records progress only for the owner of the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ username: "Actual_Solver" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const rpc = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer real_token" },
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
  });

  it("does not write progress for a forged token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));

    const response = await handler({
      httpMethod: "POST",
      headers: { authorization: "Bearer forged_token" },
      body: JSON.stringify({ puzzleId: "42", puzzleCorrect: true }),
    });

    expect(response.statusCode).toBe(401);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
