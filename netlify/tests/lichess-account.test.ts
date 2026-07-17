import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearLichessAccountVerificationCache,
  LichessVerificationError,
  parseBearerToken,
  verifyCachedLichessAccount,
  verifyLichessAccount,
} from "../lib/lichessAccount";

describe("parseBearerToken", () => {
  it("accepts the documented Lichess token format", () => {
    expect(parseBearerToken({ authorization: "Bearer lio_AbC123" })).toBe("lio_AbC123");
  });

  it("rejects malformed or oversized bearer credentials", () => {
    expect(parseBearerToken({ authorization: "Bearer token-with-hyphens" })).toBe("");
    expect(parseBearerToken({ authorization: `Bearer ${"a".repeat(513)}` })).toBe("");
  });
});

describe("legacy bearer-session migration", () => {
  afterEach(() => {
    clearLichessAccountVerificationCache();
    vi.restoreAllMocks();
  });

  it("caches the identity while concurrent pre-release sessions migrate", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ username: "Viewer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(verifyCachedLichessAccount("access-token")).resolves.toMatchObject({
      username: "Viewer",
    });
    await expect(verifyCachedLichessAccount("access-token")).resolves.toMatchObject({
      username: "Viewer",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("deduplicates concurrent identity checks for the same token", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    const first = verifyCachedLichessAccount("shared-token");
    const second = verifyCachedLichessAccount("shared-token");
    resolveFetch?.(
      new Response(JSON.stringify({ username: "Viewer" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { username: "Viewer" },
      { username: "Viewer" },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("distinguishes a rejected token from temporary Lichess failures", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(verifyLichessAccount("rejected-token")).resolves.toBeNull();
    await expect(verifyLichessAccount("valid-token")).rejects.toBeInstanceOf(
      LichessVerificationError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a successful response whose account payload has the wrong shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ username: 42 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(verifyLichessAccount("valid-token")).resolves.toBeNull();
  });
});
