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

describe("server-owned Lichess sessions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("clears legacy credentials and announces a rejected site session", () => {
    const listener = vi.fn();
    window.localStorage.setItem(LICHESS_SESSION_STORAGE_KEY, '{"accessToken":"expired"}');
    window.addEventListener(LICHESS_SESSION_INVALID_EVENT, listener);

    invalidateLichessSessionForResponse(new Response(null, { status: 401 }));

    expect(window.localStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(LICHESS_SESSION_INVALID_EVENT, listener);
  });

  it("does not invalidate the session for non-authentication failures", () => {
    const listener = vi.fn();
    window.addEventListener(LICHESS_SESSION_INVALID_EVENT, listener);

    invalidateLichessSessionForResponse(new Response(null, { status: 500 }));

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(LICHESS_SESSION_INVALID_EVENT, listener);
  });

  it("sends the authorization code to the first-party server and stores no bearer token", async () => {
    storePendingAuth();
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { username: "Viewer" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await completeLichessLogin("?code=fresh_code&state=expected-state");

    expect(result).toEqual({ session: { me: { username: "Viewer" } }, returnTo: "/comments" });
    expect(window.localStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(pendingAuthStorageKey)).toBeNull();
    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("/api/auth/session");
    expect(request).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(JSON.parse(String(request?.body))).toMatchObject({
      code: "fresh_code",
      codeVerifier: "verifier",
    });
    expect(request?.headers).not.toHaveProperty("Authorization");
  });

  it("hydrates identity from the signed first-party cookie and deletes legacy storage", async () => {
    window.localStorage.setItem(LICHESS_SESSION_STORAGE_KEY, '{"accessToken":"legacy"}');
    const fetchMock = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { username: "SavedViewer" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(restoreLichessSession()).resolves.toEqual({
      me: { username: "SavedViewer" },
    });
    expect(window.localStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("treats a missing signed cookie as anonymous", async () => {
    vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "No authenticated site session." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(restoreLichessSession()).resolves.toBeNull();
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

  it("reports a callback with no pending PKCE state as stale", async () => {
    await expect(completeLichessLogin("?code=used_code&state=old-state")).rejects.toMatchObject({
      code: "stale_callback",
      canRetryCallback: false,
    });
  });
});
