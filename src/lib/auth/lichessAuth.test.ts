import { afterEach, describe, expect, it, vi } from "vitest";

import {
  invalidateLichessSessionForResponse,
  LICHESS_SESSION_INVALID_EVENT,
  LICHESS_SESSION_STORAGE_KEY,
} from "./lichessAuth";

describe("invalidateLichessSessionForResponse", () => {
  afterEach(() => {
    window.localStorage.clear();
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

  it("keeps the login for non-authentication errors", () => {
    window.localStorage.setItem(LICHESS_SESSION_STORAGE_KEY, '{"accessToken":"valid"}');

    invalidateLichessSessionForResponse(new Response(null, { status: 500 }), "valid");

    expect(window.localStorage.getItem(LICHESS_SESSION_STORAGE_KEY)).not.toBeNull();
  });
});
