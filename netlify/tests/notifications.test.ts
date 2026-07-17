import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

import { handler } from "../functions/notifications";
import { createSiteSessionCookie } from "../lib/siteSession";

describe("notifications function", () => {
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
    vi.restoreAllMocks();
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
      body: JSON.stringify({ action: "list" }),
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects malformed notification ids before reading the session", async () => {
    const response = await handler({
      httpMethod: "POST",
      body: JSON.stringify({ action: "markRead", ids: [1, "2"] }),
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("loads private data from the signed session without contacting Lichess", async () => {
    const is = vi.fn(async () => ({ count: 3, error: null }));
    const eq = vi.fn(() => ({ is }));
    const select = vi.fn(() => ({ eq }));
    mocks.createClient.mockReturnValue({ from: vi.fn(() => ({ select })) });
    const cookie = createSiteSessionCookie("NotificationViewer", {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handler({
      httpMethod: "POST",
      headers: { cookie: cookie.split(";")[0] },
      body: JSON.stringify({ action: "count" }),
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ unreadCount: 3 });
    expect(eq).toHaveBeenCalledWith("recipient_username", "notificationviewer");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-site notification mutations", async () => {
    const response = await handler({
      httpMethod: "POST",
      headers: { host: "atomic.example", origin: "https://evil.example" },
      body: JSON.stringify({ action: "markRead", ids: [1] }),
    });

    expect(response.statusCode).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
