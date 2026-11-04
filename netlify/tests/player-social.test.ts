import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  resolveCanonicalArchiveUsername: vi.fn(async (username: string) => username.toLowerCase()),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("../archive/aliases", () => ({
  resolveCanonicalArchiveUsername: mocks.resolveCanonicalArchiveUsername,
}));

import { handler } from "../functions/player-social";
import { createSiteSessionCookie } from "../lib/siteSession";

const ownerHeaders = (username: string) => ({
  cookie: createSiteSessionCookie(username, {}).split(";")[0],
  host: "atomic.example",
  origin: "https://atomic.example",
});

describe("player social function", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.resolveCanonicalArchiveUsername.mockClear();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv(
      "SITE_SESSION_SECRET",
      "test-session-secret-that-is-longer-than-thirty-two-characters",
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("requires a signed-in same-origin user for social mutations", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: { host: "atomic.example", origin: "https://evil.example" },
      body: JSON.stringify({ action: "follow", username: "alice" }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("stores flair against the signed session identity rather than request input", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    mocks.createClient.mockReturnValue({ from: vi.fn(() => ({ upsert })) });

    const response = await handler({
      httpMethod: "POST",
      headers: ownerHeaders("Alice"),
      body: JSON.stringify({ action: "setFlair", flair: "🐺" }),
    });

    expect(response.statusCode).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alice", flair: "🐺" }),
      { onConflict: "username" },
    );
  });

  it("rejects flair outside the curated native emoji set", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: ownerHeaders("Alice"),
      body: JSON.stringify({ action: "setFlair", flair: "♞" }),
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("stores a site-profile country without changing tournament countries", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    mocks.createClient.mockReturnValue({ from });

    const response = await handler({
      httpMethod: "POST",
      headers: ownerHeaders("Alice"),
      body: JSON.stringify({ action: "setCountry", countryCode: "dk" }),
    });

    expect(response.statusCode).toBe(200);
    expect(from).toHaveBeenCalledWith("player_social_profiles");
    expect(from).not.toHaveBeenCalledWith("player_countries");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alice", country_code: "DK" }),
      { onConflict: "username" },
    );
  });
});
