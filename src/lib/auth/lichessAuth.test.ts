import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeLichessLogin,
  invalidateLichessSessionForResponse,
  LICHESS_SESSION_INVALID_EVENT,
  LICHESS_SESSION_STORAGE_KEY,
  restoreLichessSession,
} from "./lichessAuth";

const pendingAuthStorageKey = "atomic-puzzles.lichess-pending-auth";

const storePendingAuth = (): void => {
  window.sessionStorage.setItem(
    pendingAuthStorageKey,
    JSON.stringify({
      state: "expected-state",
      codeVerifier: "verifier",
      returnTo: "/comments",
      createdAt: Date.now(),
    }),
  );
};

describe("invalidateLichessSessionForResponse", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("clears the stored login and announces an authenticated 401", () => {
    const listener = vi.fn();
    window.localStorage.setItem(LICHESS_SESSION_STORAGE_KEY, '{"accessToken":"expired"}');
    window.addEventListener(LICHESS_SESSION_INVALID_EVENT, listener);

    invalidateLichessSessionForResponse(new Response(null, { status: 401 }), "expired");

    expect(window.localStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(LICHESS_SESSION_INVALID_EVENT, listener);
  });

  it.each([200, 400, 403, 429, 500, 503])("does not clear a valid login for HTTP %s", (status) => {
    window.localStorage.setItem(LICHESS_SESSION_STORAGE_KEY, '{"accessToken":"valid"}');

    invalidateLichessSessionForResponse(new Response(null, { status }), "valid");

    expect(window.localStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).not.toBeNull();
  });

  it("ignores an anonymous 401 that has no authenticated token", () => {
    window.localStorage.setItem(LICHESS_SESSION_STORAGE_KEY, '{"accessToken":"valid"}');

    invalidateLichessSessionForResponse(new Response(null, { status: 401 }), "");

    expect(window.localStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).not.toBeNull();
  });
});

describe("Lichess OAuth callback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("keeps a valid session when Lichess does not provide an expiration", async () => {
    storePendingAuth();
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "access_token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: { username: "Viewer" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await completeLichessLogin("?code=fresh_code&state=expected-state");

    expect(result.returnTo).toBe("/comments");
    expect(result.session).toMatchObject({
      accessToken: "access_token",
      expiresAt: null,
      me: { username: "Viewer" },
    });
    expect(
      JSON.parse(window.localStorage.getItem(LICHESS_SESSION_STORAGE_KEY) ?? "{}"),
    ).toMatchObject(result.session);
    expect(window.sessionStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).toBeNull();
    expect(await restoreLichessSession()).toEqual(result.session);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports a callback with no pending PKCE state as stale", async () => {
    await expect(completeLichessLogin("?code=used_code&state=old-state")).rejects.toMatchObject({
      code: "stale_callback",
      canRetryCallback: false,
    });
  });

  it("does not revive obsolete OAuth attempts from persistent local storage", async () => {
    window.localStorage.setItem(
      pendingAuthStorageKey,
      JSON.stringify({
        state: "old-state",
        codeVerifier: "old-verifier",
        returnTo: "/comments",
      }),
    );
    const fetchMock = vi.spyOn(window, "fetch");

    await expect(completeLichessLogin("?code=old_code&state=old-state")).rejects.toMatchObject({
      code: "stale_callback",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(pendingAuthStorageKey)).toBeNull();
  });

  it("reuses an exchanged token when establishing the site session temporarily fails", async () => {
    storePendingAuth();
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "recovery_token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "temporarily unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: { username: "RecoveredViewer" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(
      completeLichessLogin("?code=fresh_code&state=expected-state"),
    ).rejects.toMatchObject({
      code: "account_load_failed",
      canRetryCallback: true,
    });

    const result = await completeLichessLogin("?code=fresh_code&state=expected-state");

    expect(result.session.me.username).toBe("RecoveredViewer");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe("/api/auth/session");
  });

  it("turns Lichess anti-poll responses into a delayed retry without losing the token", async () => {
    storePendingAuth();
    const fetchMock = vi
      .spyOn(window, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "rate_limited_token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Lichess is temporarily limiting account checks." }), {
          status: 429,
          headers: { "Content-Type": "application/json", "Retry-After": "30" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ user: { username: "RecoveredViewer" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    await expect(
      completeLichessLogin("?code=fresh_code&state=expected-state"),
    ).rejects.toMatchObject({
      code: "account_rate_limited",
      canRetryCallback: true,
      retryAfterMs: 30_000,
      message: expect.not.stringContaining("poll this endpoint"),
    });

    await expect(
      completeLichessLogin("?code=fresh_code&state=expected-state"),
    ).resolves.toMatchObject({ session: { me: { username: "RecoveredViewer" } } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe("/api/auth/session");
  });

  it("clears a rejected single-use code and asks for a fresh login", async () => {
    storePendingAuth();
    vi.spyOn(window, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      completeLichessLogin("?code=used_code&state=expected-state"),
    ).rejects.toMatchObject({
      code: "code_rejected",
      canRetryCallback: false,
    });
    expect(window.sessionStorage.getItem(pendingAuthStorageKey)).toBeNull();
  });

  it("restores a saved login without depending on Lichess availability", async () => {
    window.localStorage.setItem(
      LICHESS_SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: "real_token",
        expiresAt: null,
        me: { username: "SavedViewer" },
      }),
    );
    const fetchMock = vi.spyOn(window, "fetch");

    await expect(restoreLichessSession()).resolves.toMatchObject({
      accessToken: "real_token",
      me: { username: "SavedViewer" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("restores a saved login that has not expired without a network request", async () => {
    const session = {
      accessToken: "future_token",
      expiresAt: Date.now() + 60_000,
      me: { username: "FutureViewer" },
    };
    window.localStorage.setItem(LICHESS_SESSION_STORAGE_KEY, JSON.stringify(session));
    const fetchMock = vi.spyOn(window, "fetch");

    await expect(restoreLichessSession()).resolves.toEqual(session);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("migrates a tab-scoped session to persistent storage without reauthentication", async () => {
    const session = {
      accessToken: "legacy_token",
      expiresAt: null,
      me: { username: "LegacyViewer" },
    };
    window.sessionStorage.setItem(LICHESS_SESSION_STORAGE_KEY, JSON.stringify(session));
    const fetchMock = vi.spyOn(window, "fetch");

    await expect(restoreLichessSession()).resolves.toEqual(session);
    expect(JSON.parse(window.localStorage.getItem(LICHESS_SESSION_STORAGE_KEY) ?? "null")).toEqual(
      session,
    );
    expect(window.sessionStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears a genuinely expired saved login without contacting Lichess", async () => {
    window.localStorage.setItem(
      LICHESS_SESSION_STORAGE_KEY,
      JSON.stringify({
        accessToken: "expired_token",
        expiresAt: Date.now() - 1,
        me: { username: "ExpiredViewer" },
      }),
    );
    const fetchMock = vi.spyOn(window, "fetch");

    await expect(restoreLichessSession()).resolves.toBeNull();
    expect(window.localStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears a malformed saved login", async () => {
    window.localStorage.setItem(
      LICHESS_SESSION_STORAGE_KEY,
      JSON.stringify({ accessToken: "real_token", expiresAt: null, me: {} }),
    );

    await expect(restoreLichessSession()).resolves.toBeNull();
    expect(window.localStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("rejects a state-substitution attempt without exchanging its code", async () => {
    storePendingAuth();
    const fetchMock = vi.spyOn(window, "fetch");

    await expect(
      completeLichessLogin("?code=attacker_code&state=attacker-state"),
    ).rejects.toMatchObject({ code: "invalid_callback" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(pendingAuthStorageKey)).not.toBeNull();
  });

  it("does not let a forged OAuth error cancel the real pending login", async () => {
    storePendingAuth();

    await expect(
      completeLichessLogin("?error=access_denied&state=attacker-state"),
    ).rejects.toMatchObject({ code: "invalid_callback" });
    expect(window.sessionStorage.getItem(pendingAuthStorageKey)).not.toBeNull();
  });
});
