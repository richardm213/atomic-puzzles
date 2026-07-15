import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearLichessAccountVerificationCache,
  parseBearerToken,
  verifyCachedLichessAccount,
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

describe("verifyCachedLichessAccount", () => {
  afterEach(() => {
    clearLichessAccountVerificationCache();
    vi.restoreAllMocks();
  });

  it("caches a verified identity for repeated authenticated actions", async () => {
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
});
