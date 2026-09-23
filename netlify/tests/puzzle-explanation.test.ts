import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/puzzle-explanation";
import { createSiteSessionCookie } from "../lib/siteSession";

const authHeaders = (username: string) => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
});

const mockPuzzleUpdate = (
  author: string,
  savedExplanation = "Saved explanation",
  hasAttempt = true,
) => {
  const lookupSingle = vi.fn(async () => ({ data: { id: 42, author }, error: null }));
  const lookupEq = vi.fn(() => ({ single: lookupSingle }));
  const lookupSelect = vi.fn(() => ({ eq: lookupEq }));
  const attemptMaybeSingle = vi.fn(async () => ({
    data: hasAttempt ? { puzzle_id: "42" } : null,
    error: null,
  }));
  const attemptPuzzleEq = vi.fn(() => ({ maybeSingle: attemptMaybeSingle }));
  const attemptUsernameEq = vi.fn(() => ({ eq: attemptPuzzleEq }));
  const attemptSelect = vi.fn(() => ({ eq: attemptUsernameEq }));
  const updateSingle = vi.fn(async () => ({
    data: { id: 42, explanation: savedExplanation },
    error: null,
  }));
  const updateSelect = vi.fn(() => ({ single: updateSingle }));
  const updateEq = vi.fn(() => ({ select: updateSelect }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const from = vi
    .fn()
    .mockReturnValueOnce({ select: lookupSelect })
    .mockReturnValueOnce({ select: attemptSelect })
    .mockReturnValueOnce({ update });
  mocks.createClient.mockReturnValue({ from });
  return { from, update };
};

describe("puzzle-explanation function", () => {
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

  it("lets a puzzle author add or edit their explanation", async () => {
    const { update } = mockPuzzleUpdate("Puzzle_Author");
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("puzzle_author"),
      body: JSON.stringify({ puzzleId: 42, explanation: "  Saved explanation  " }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ puzzleId: 42, explanation: "Saved explanation" });
    expect(update).toHaveBeenCalledWith({ explanation: "Saved explanation" });
  });

  it("lets seaside_tiramisu edit legacy puzzles authored by admin, including clearing them", async () => {
    const { update } = mockPuzzleUpdate("admin", "");
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("seaside_tiramisu"),
      body: JSON.stringify({ puzzleId: 42, explanation: "" }),
    });

    expect(response.statusCode).toBe(200);
    expect(update).toHaveBeenCalledWith({ explanation: "" });
  });

  it("does not let seaside_tiramisu edit puzzles by other authors", async () => {
    const { from, update } = mockPuzzleUpdate("randoomplayer");
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("seaside_tiramisu"),
      body: JSON.stringify({ puzzleId: 42, explanation: "Not allowed" }),
    });

    expect(response.statusCode).toBe(403);
    expect(from).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects a logged-in user who is neither the author nor seaside_tiramisu", async () => {
    const { from, update } = mockPuzzleUpdate("puzzle_author");
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("someone_else"),
      body: JSON.stringify({ puzzleId: 42, explanation: "Not allowed" }),
    });

    expect(response.statusCode).toBe(403);
    expect(from).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it("requires an allowed editor to attempt the puzzle first", async () => {
    const { from, update } = mockPuzzleUpdate("puzzle_author", "Saved explanation", false);
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("puzzle_author"),
      body: JSON.stringify({ puzzleId: 42, explanation: "Too early" }),
    });

    expect(response.statusCode).toBe(403);
    expect(from).toHaveBeenCalledTimes(2);
    expect(update).not.toHaveBeenCalled();
  });
});
