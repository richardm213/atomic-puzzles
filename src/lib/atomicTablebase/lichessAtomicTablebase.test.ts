import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { probeAtomicTablebase } from "./lichessAtomicTablebase";

const response = () =>
  new Response(
    JSON.stringify({
      category: "draw",
      dtz: 0,
      checkmate: false,
      stalemate: false,
      variant_win: false,
      variant_loss: false,
      moves: [],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

describe("Lichess atomic tablebase cache", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reuses recent probes and releases them after the short TTL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-01T22:00:00-08:00"));
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response()));
    vi.stubGlobal("fetch", fetchMock);
    const fen = "8/8/8/8/8/8/8/K6k w - - 0 1";

    await probeAtomicTablebase(fen);
    await probeAtomicTablebase(fen);
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(16 * 60_000);
    await probeAtomicTablebase(fen);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

it("allows real tablebase requests through the deployed connection policy", async () => {
  const fetchMock = vi.fn().mockResolvedValue(response());
  vi.stubGlobal("fetch", fetchMock);
  try {
    await probeAtomicTablebase("8/8/8/8/8/8/4k3/KQ6 w - - 0 99");
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const policy = readFileSync("public/_headers", "utf8").match(/connect-src ([^;]+)/)?.[1];
    expect(policy?.split(/\s+/)).toContain(url.origin);
  } finally {
    vi.unstubAllGlobals();
  }
});
