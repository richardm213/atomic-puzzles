import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExplorerApiResponse } from "../utils/openingExplorer";
import { fetchExplorerApiResponse } from "../utils/openingExplorer";
import { useOpeningExplorer } from "./useOpeningExplorer";
import { useOpeningPositionLeaders } from "./useOpeningPositionLeaders";

vi.mock("../utils/openingExplorer", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/openingExplorer")>()),
  fetchExplorerApiResponse: vi.fn(),
}));
const fen = "8/8/8/8/8/8/8/K6k w - - 0 1";
const leaders = {
  lastMoveColor: 1 as const,
  totalGames: 100,
  leaders: [{ username: "alice", games: 50 }],
};
const payload: ExplorerApiResponse = { moves: [], recentGames: [], positionLeaders: leaders };
const fetchMock = vi.mocked(fetchExplorerApiResponse);
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("independent position leaders", () => {
  it("does not fetch when unchecked, aborts when disabled, and ignores late results", async () => {
    let resolve!: (value: ExplorerApiResponse) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const { result, rerender } = renderHook(
      ({ enabled }) => useOpeningPositionLeaders(fen, enabled),
      {
        initialProps: { enabled: false },
      },
    );
    expect(fetchMock).not.toHaveBeenCalled();
    rerender({ enabled: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toContain("part=leaders");
    const signal = fetchMock.mock.calls[0]![2]!;
    rerender({ enabled: false });
    expect(signal.aborted).toBe(true);
    await act(async () => {
      resolve(payload);
    });
    expect(result.current).toBeNull();
  });

  it.each(["moves", "leaders"])("publishes %s before the other response", async (first) => {
    let resolveLeaders!: (value: ExplorerApiResponse) => void;
    let resolveMoves!: (value: { response: ExplorerApiResponse }) => void;
    fetchMock.mockImplementation(
      () =>
        new Promise((r) => {
          resolveLeaders = r;
        }),
    );
    const request = vi.fn(
      () =>
        new Promise<{ response: ExplorerApiResponse }>((r) => {
          resolveMoves = r;
        }),
    );
    const { result } = renderHook(() => ({
      moves: useOpeningExplorer({ fen, playerColor: "white", showPerformance: false, request }),
      leaders: useOpeningPositionLeaders(fen, true),
    }));
    if (first === "moves") {
      await act(async () => {
        resolveMoves({ response: { moves: [], recentGames: [] } });
      });
      expect(result.current.moves.status).toBe("ready");
      expect(result.current.leaders).toBeNull();
      await act(async () => {
        resolveLeaders(payload);
      });
    } else {
      await act(async () => {
        resolveLeaders(payload);
      });
      expect(result.current.leaders).toEqual(leaders);
      expect(result.current.moves.status).toBe("loading");
      await act(async () => {
        resolveMoves({ response: { moves: [], recentGames: [] } });
      });
    }
    expect(result.current.moves.status).toBe("ready");
    expect(result.current.leaders).toEqual(leaders);
  });

  it("aborts superseded positions and reuses cached leaders", async () => {
    fetchMock.mockResolvedValue(payload);
    const { result, rerender } = renderHook(
      ({ position }) => useOpeningPositionLeaders(position, true),
      {
        initialProps: { position: fen },
      },
    );
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current).toEqual(leaders);
    rerender({ position: fen.replace("0 1", "0 2") });
    expect(result.current).toBeNull();
    expect(fetchMock.mock.calls[0]![2]!.aborted).toBe(true);
    rerender({ position: fen });
    expect(result.current).toEqual(leaders);
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
