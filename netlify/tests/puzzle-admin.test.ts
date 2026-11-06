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

  it("does not expose puzzle administration to other signed-in users", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: authHeaders("someone_else"),
      body: JSON.stringify({ action: "get", direction: "latest" }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
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
