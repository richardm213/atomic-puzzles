import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { usePracticeReplica } from "./usePracticeReplica";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("keeps one request across clock ticks and discards replies after pausing or changing position", async () => {
  const replies: Array<(value: unknown) => void> = [];
  const fetchMock = vi.fn(() => new Promise((resolve) => replies.push(resolve)));
  vi.stubGlobal("fetch", fetchMock);
  const onMove = vi.fn();
  const initial = {
    enabled: true,
    model: "human" as const,
    rating: 1800,
    opponentRating: 2000,
    fen: "position-a",
    rootFen: "start",
    moves: [] as string[],
    clockMs: 180000,
    timeControl: [180, 0] as [number, number],
    exclude: [],
    retry: 0,
    onMove,
  };
  const { rerender } = renderHook(usePracticeReplica, { initialProps: initial });
  rerender({ ...initial, clockMs: 179000 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(
    JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string),
  ).toMatchObject({ model: "human", rating: 1800, opponentRating: 2000 });
  const signal = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
  rerender({ ...initial, enabled: false });
  expect(signal.aborted).toBe(true);
  await act(async () =>
    replies[0]!({ ok: true, json: async () => ({ fen: "position-a", move: "e2e4" }) }),
  );
  expect(onMove).not.toHaveBeenCalled();
  rerender({ ...initial, fen: "position-b" });
  rerender({ ...initial, fen: "position-b", rating: 1600 });
  await act(async () =>
    replies[1]!({ ok: true, json: async () => ({ fen: "position-b", move: "e2e4" }) }),
  );
  expect(onMove).not.toHaveBeenCalled();
  await act(async () =>
    replies[2]!({ ok: true, json: async () => ({ fen: "position-b", move: "d2d4" }) }),
  );
  await waitFor(() => expect(onMove).toHaveBeenCalledExactlyOnceWith("d2d4"));
});
