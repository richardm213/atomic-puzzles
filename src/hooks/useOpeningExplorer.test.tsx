import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type OpeningExplorerRequest, useOpeningExplorer } from "./useOpeningExplorer";

const fen = "8/8/8/8/8/8/8/K6k w - - 0 1";
const response: OpeningExplorerRequest = { response: { moves: [], recentGames: [] } };
const options = { fen, playerColor: "white" as const, showPerformance: false, debounceMs: 250 };
const pending = () => {
  let resolve!: (value: OpeningExplorerRequest) => void;
  const promise = new Promise<OpeningExplorerRequest>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("opening explorer navigation", () => {
  it("aborts immediately, debounces a burst to its last position, and ignores late responses", async () => {
    const first = pending();
    const requestA = vi.fn((_signal: AbortSignal) => first.promise);
    const requestB = vi.fn(async () => response);
    const requestC = vi.fn(async () => response);
    const { result, rerender, unmount } = renderHook(
      ({ request }) => useOpeningExplorer({ ...options, request }),
      { initialProps: { request: requestA } },
    );
    expect(requestA).toHaveBeenCalledTimes(1);
    rerender({ request: requestB });
    expect(requestA.mock.calls[0]![0].aborted).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(100));
    rerender({ request: requestC });
    await act(async () => {
      first.resolve(response);
      await vi.advanceTimersByTimeAsync(249);
    });
    expect(result.current.status).toBe("loading");
    expect(requestB).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(requestC).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe("ready");
    unmount();
  });

  it("reuses a filter-specific cached result immediately and expires it", async () => {
    const request = vi.fn(async (_signal: AbortSignal) => response);
    const { result, rerender } = renderHook(
      ({ cacheKey }) => useOpeningExplorer({ ...options, request, cacheKey }),
      { initialProps: { cacheKey: "A:bullet" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    rerender({ cacheKey: "A:blitz" });
    expect(result.current.status).toBe("loading");
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(request).toHaveBeenCalledTimes(2);
    rerender({ cacheKey: "A:bullet" });
    expect(result.current.status).toBe("ready");
    expect(request).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(300_001));
    rerender({ cacheKey: "A:blitz" });
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("aborts on timeout, hiding, and unmount without a cancellation error", async () => {
    const request = vi.fn((_signal: AbortSignal) => pending().promise);
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useOpeningExplorer({ ...options, request, enabled, timeoutMs: 1000 }),
      { initialProps: { enabled: true } },
    );
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(request.mock.calls[0]![0].aborted).toBe(true);
    expect(result.current.status).toBe("error");
    rerender({ enabled: false });
    expect(result.current.status).toBe("idle");
    rerender({ enabled: true });
    expect(request).toHaveBeenCalledTimes(2);
    unmount();
    expect(request.mock.calls[1]![0].aborted).toBe(true);
  });
  it("cancels a scheduled fetch when navigating back to a cached position", async () => {
    const request = vi.fn(async (_signal: AbortSignal) => response);
    const { result, rerender } = renderHook(
      ({ cacheKey }) => useOpeningExplorer({ ...options, request, cacheKey }),
      { initialProps: { cacheKey: "A" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    rerender({ cacheKey: "B" });
    expect(result.current.status).toBe("loading");
    rerender({ cacheKey: "A" });
    expect(result.current.status).toBe("ready");
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps one ordering session per explorer and sequences only actual requests", async () => {
    const request = vi.fn(
      async (_signal: AbortSignal, _navigation: { session: string; sequence: number }) => response,
    );
    const { rerender } = renderHook(
      ({ cacheKey }) => useOpeningExplorer({ ...options, request, cacheKey }),
      { initialProps: { cacheKey: "A" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    rerender({ cacheKey: "B" });
    await act(() => vi.advanceTimersByTimeAsync(100));
    rerender({ cacheKey: "C" });
    await act(() => vi.advanceTimersByTimeAsync(250));
    const first = request.mock.calls[0]![1];
    const second = request.mock.calls[1]![1];
    expect(first.sequence).toBe(1);
    expect(second).toEqual({ session: first.session, sequence: 2 });
    expect(first.session).toMatch(/^[a-f0-9-]{36}$/);
    expect(request).toHaveBeenCalledTimes(2);
  });
});
