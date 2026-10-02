import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import { handler } from "../functions/puzzle-play";

describe("puzzle-play function", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("does not return solution text with puzzle details", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    const query = {
      select: vi.fn(),
      in: vi.fn(async () => ({
        data: [{ id: 42, fen: "some fen", solution: "secret line" }],
        error: null,
      })),
    };
    query.select.mockReturnValue(query);
    mocks.createClient.mockReturnValue({ from: vi.fn(() => query) });

    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "details", puzzleIds: [42] }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("secret line");
  });
});
