import { afterEach, describe, expect, it, vi } from "vitest";

import { postApi } from "./postApi";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("postApi", () => {
  it("preserves structured server errors and request IDs for support diagnostics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "Invalid puzzle details request.",
          code: "validation_failed",
          details: { issues: [{ path: "puzzleIds", message: "Required" }] },
        }),
        {
          status: 400,
          headers: {
            "X-Request-Id": "request-42",
            "Content-Type": "application/json",
            "Retry-After": "5",
          },
        },
      ),
    );

    const request = postApi("/api/puzzles/play", {}, { errorMessage: "Request failed." });

    await expect(request).rejects.toMatchObject({
      name: "ApiError",
      message: "Invalid puzzle details request.",
      status: 400,
      code: "validation_failed",
      requestId: "request-42",
      retryAfterMs: 5_000,
      details: { issues: [{ path: "puzzleIds", message: "Required" }] },
    });
  });

  it("aborts stalled requests with a distinct timeout error", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    const request = postApi(
      "/api/puzzles/play",
      {},
      {
        errorMessage: "Request failed.",
        timeoutMs: 100,
      },
    );
    const assertion = expect(request).rejects.toMatchObject({
      status: 0,
      code: "request_timeout",
    });
    await vi.advanceTimersByTimeAsync(100);

    await assertion;
  });
});
