import { afterEach, describe, expect, it, vi } from "vitest";

import type { AtomicTablebaseResponse } from "../atomicTablebase/lichessAtomicTablebase";
import {
  chooseEqualTablebaseDefense,
  classifyTablebaseEvaluation,
  classifyTablebaseStart,
  equalBestTablebaseDefenseUcis,
  probeEndgameTablebase,
} from "./tablebaseDefense";

const move = (
  uci: string,
  category: AtomicTablebaseResponse["moves"][number]["category"],
  dtz: number,
): AtomicTablebaseResponse["moves"][number] => ({
  uci,
  category,
  dtz,
  zeroing: false,
  checkmate: false,
  stalemate: false,
  variant_win: false,
  variant_loss: false,
});

const response: AtomicTablebaseResponse = {
  category: "loss",
  dtz: -7,
  checkmate: false,
  stalemate: false,
  variant_win: false,
  variant_loss: false,
  moves: [
    move("d6e6", "win", 8),
    move("d6c6", "win", 8),
    move("d6e5", "win", 6),
    move("d6c5", "draw", 20),
  ],
};

describe("tablebase endgame defense", () => {
  it("keeps only moves with the same tablebase result and DTZ as the top move", () => {
    expect(equalBestTablebaseDefenseUcis(response)).toEqual(["d6e6", "d6c6"]);
  });

  it("selects uniformly among tablebase-equal defenses", () => {
    expect(chooseEqualTablebaseDefense(response, () => 0)).toBe("d6e6");
    expect(chooseEqualTablebaseDefense(response, () => 0.99)).toBe("d6c6");
  });
});

describe("tablebase start validation", () => {
  it("accepts a proven win with enough DTZ margin without engine analysis", () => {
    expect(classifyTablebaseStart({ ...response, category: "win", dtz: 13 })).toBe("accept");
  });
  it("preserves winning starts when DTZ is small or unknown", () => {
    for (const dtz of [11, 9, null]) {
      expect(classifyTablebaseStart({ ...response, category: "win", dtz })).toBe("engine");
    }
    expect(
      classifyTablebaseStart({
        ...response,
        category: "unknown",
        dtz: null,
      }),
    ).toBe("engine");
  });
  it("rejects tablebase draws and losses", () => {
    for (const category of ["draw", "loss"] as const) {
      expect(classifyTablebaseStart({ ...response, category })).toBe("reject");
    }
  });
});

describe("tablebase round evaluation", () => {
  it("uses definite outcomes and falls back for uncertain ones", () => {
    expect(classifyTablebaseEvaluation({ ...response, category: "win" })).toBe("winning");
    expect(classifyTablebaseEvaluation({ ...response, category: "draw" })).toBe("draw");
    expect(classifyTablebaseEvaluation({ ...response, category: "loss" })).toBe("lost");
    expect(classifyTablebaseEvaluation({ ...response, category: "unknown" })).toBe("unknown");
  });
});

describe("bounded tablebase access", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("probes supported material and skips positions above the supported piece count", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (await probeEndgameTablebase("7k/8/8/8/8/7p/P7/KQ6 w - - 0 12", new AbortController().signal))
        ?.category,
    ).toBe("loss");
    expect(
      await probeEndgameTablebase(
        "7k/8/8/8/8/7p/PPP5/KQ6 w - - 0 12",
        new AbortController().signal,
      ),
    ).toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("falls back promptly when the service hangs or returns an error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const pending = probeEndgameTablebase(
      "7k/8/8/8/8/8/7p/KQ6 w - - 0 13",
      new AbortController().signal,
    );
    await vi.advanceTimersByTimeAsync(1_200);
    expect(await pending).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    expect(
      await probeEndgameTablebase("7k/8/8/8/8/8/7p/KQ6 w - - 0 14", new AbortController().signal),
    ).toBeNull();
  });
});
