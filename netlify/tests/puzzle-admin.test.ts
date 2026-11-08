import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PuzzleAdminRepository } from "../features/puzzles/admin/repository";
import { PuzzleAdminService } from "../features/puzzles/admin/service";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/puzzle-admin";
import { createSiteSessionCookie } from "../lib/siteSession";

const authHeaders = (username: string) => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
});

describe("puzzle-admin function", () => {
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

  it("does not let other signed-in users penalize a tag vote", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("someone_else"),
      body: JSON.stringify({ action: "mark-tag-vote-incorrect", puzzleId: 42, voteId: 17 }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("marks only the selected vote using the authenticated administrator", async () => {
    const reviewedAt = "2026-11-07T18:00:00Z";
    const rpc = vi.fn(async () => ({ data: reviewedAt, error: null }));
    mocks.createClient.mockReturnValue({ rpc });

    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("seaside_tiramisu"),
      body: JSON.stringify({ action: "mark-tag-vote-incorrect", puzzleId: 42, voteId: 17 }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ reviewedAt });
    expect(rpc).toHaveBeenCalledWith("mark_puzzle_tag_vote_incorrect", {
      p_puzzle_id: 42,
      p_vote_id: 17,
      p_reviewer: "seaside_tiramisu",
    });
  });

  it("passes the authenticated administrator into reversible deletion", async () => {
    const deletePuzzle = vi.fn(async () => undefined);
    const getPuzzle = vi.fn(async () => ({ puzzle: { id: 42 } }));
    const repository = {
      delete: deletePuzzle,
      get: getPuzzle,
    } as unknown as PuzzleAdminRepository;
    const service = new PuzzleAdminService(repository, "seaside_tiramisu");

    await expect(service.execute({ action: "delete", puzzleId: 42 })).resolves.toEqual({
      puzzle: { id: 42 },
    });
    expect(deletePuzzle).toHaveBeenCalledWith(42, "seaside_tiramisu");
    expect(getPuzzle).toHaveBeenCalledWith(42, "exact");
  });
});
