import { afterEach, describe, expect, it, vi } from "vitest";

import {
  chooseEngineCandidate,
  disableFirefoxAtomicsWaitAsync,
  type EngineCandidate,
  fairyStockfishEvaluationCacheKey,
  isCacheableFairyStockfishEvaluation,
  isDeeperFairyStockfishEvaluation,
  parseEngineCandidate,
  withEngineRequestTimeout,
} from "./fairyStockfish";

const candidate = (
  multipv: number,
  score: number,
  scoreType: "cp" | "mate" = "cp",
): EngineCandidate => ({ move: `move${multipv}`, multipv, score, scoreType });

describe("chooseEngineCandidate", () => {
  it("always chooses the best move when it sees a forced mate", () => {
    const candidates = [candidate(1, 3, "mate"), candidate(2, 900), candidate(3, 850)];

    expect(chooseEngineCandidate(candidates, () => 0.99)?.move).toBe("move1");
  });

  it("rejects candidates more than 150 centipawns below the best move", () => {
    const candidates = [candidate(1, 200), candidate(2, 100), candidate(3, 40)];

    expect(chooseEngineCandidate(candidates, () => 0.99)?.move).toBe("move2");
  });

  it("uses normalized 40/25/15/12/8 weights across five eligible moves", () => {
    const candidates = [
      candidate(1, 100),
      candidate(2, 90),
      candidate(3, 80),
      candidate(4, 70),
      candidate(5, 60),
    ];

    expect(chooseEngineCandidate(candidates, () => 0.39)?.move).toBe("move1");
    expect(chooseEngineCandidate(candidates, () => 0.41)?.move).toBe("move2");
    expect(chooseEngineCandidate(candidates, () => 0.66)?.move).toBe("move3");
    expect(chooseEngineCandidate(candidates, () => 0.81)?.move).toBe("move4");
    expect(chooseEngineCandidate(candidates, () => 0.93)?.move).toBe("move5");
  });

  it("falls back to the only available candidate", () => {
    expect(chooseEngineCandidate([candidate(1, 0)], () => 0.99)?.move).toBe("move1");
  });

  it("chooses another safe candidate when a previous engine move is excluded", () => {
    const candidates = [
      candidate(1, 100),
      candidate(2, 90),
      candidate(3, 80),
      candidate(4, 70),
      candidate(5, 60),
    ];

    expect(chooseEngineCandidate(candidates, () => 0, new Set(["move1"]))?.move).toBe("move2");
    expect(chooseEngineCandidate(candidates, () => 0, new Set(["move1", "move2"]))?.move).toBe(
      "move3",
    );
    expect(
      chooseEngineCandidate(candidates, () => 0, new Set(["move1", "move2", "move3"]))?.move,
    ).toBe("move4");
    expect(
      chooseEngineCandidate(candidates, () => 0, new Set(["move1", "move2", "move3", "move4"]))
        ?.move,
    ).toBe("move5");
    expect(
      chooseEngineCandidate(
        candidates,
        () => 0,
        new Set(["move1", "move2", "move3", "move4", "move5"]),
      ),
    ).toBeNull();
  });

  it("does not leave a forced mate for a non-mating alternate", () => {
    const candidates = [candidate(1, 3, "mate"), candidate(2, 5, "mate"), candidate(3, 900)];

    expect(chooseEngineCandidate(candidates, () => 0.99, new Set(["move1"]))?.move).toBe("move2");
    expect(chooseEngineCandidate(candidates, () => 0.99, new Set(["move1", "move2"]))).toBeNull();
  });

  it("still plays an available move when every top move gets mated", () => {
    const candidates = [
      candidate(1, -7, "mate"),
      candidate(2, -5, "mate"),
      candidate(3, -3, "mate"),
    ];

    expect(chooseEngineCandidate(candidates, () => 0.99)?.move).toBe("move1");
    expect(chooseEngineCandidate(candidates, () => 0.99, new Set(["move1"]))?.move).toBe("move2");
  });
});

describe("parseEngineCandidate", () => {
  it("treats a missing multipv field as the primary line", () => {
    expect(
      parseEngineCandidate(
        "info depth 19 score cp 742 nodes 1000 nps 250000 time 4 pv g1f3 f7f6 b1c3",
      ),
    ).toMatchObject({
      move: "g1f3",
      multipv: 1,
      score: 742,
      depth: 19,
      nodes: 1000,
      nps: 250000,
      timeMs: 4,
    });
  });
});

describe("Fairy-Stockfish evaluation cache threshold", () => {
  it("caches only complete evaluations where every requested line reaches depth 15", () => {
    expect(
      isCacheableFairyStockfishEvaluation(
        [
          { ...candidate(1, 100), depth: 15 },
          { ...candidate(2, 90), depth: 15 },
        ],
        2,
      ),
    ).toBe(true);
    expect(
      isCacheableFairyStockfishEvaluation(
        [
          { ...candidate(1, 100), depth: 15 },
          { ...candidate(2, 90), depth: 14 },
        ],
        2,
      ),
    ).toBe(false);
    expect(isCacheableFairyStockfishEvaluation([{ ...candidate(1, 100), depth: 18 }], 2)).toBe(
      false,
    );
  });

  it("replaces a recent evaluation only after every line reaches a deeper depth", () => {
    const cached = [
      { ...candidate(1, 100), depth: 18 },
      { ...candidate(2, 90), depth: 17 },
    ];

    expect(
      isDeeperFairyStockfishEvaluation(cached, [
        { ...candidate(1, 110), depth: 20 },
        { ...candidate(2, 95), depth: 17 },
      ]),
    ).toBe(false);
    expect(isDeeperFairyStockfishEvaluation(cached, [{ ...candidate(1, 110), depth: 20 }])).toBe(
      false,
    );
    expect(
      isDeeperFairyStockfishEvaluation(cached, [
        { ...candidate(1, 110), depth: 19 },
        { ...candidate(2, 95), depth: 18 },
      ]),
    ).toBe(true);
  });

  it("isolates single-line and multi-line evaluations in the cache", () => {
    const fen = "r3k2r/pp4pp/2p1b3/3p2q1/8/5PPB/1P2Q2P/R3K1NR w KQkq - 4 14";

    expect(fairyStockfishEvaluationCacheKey("atomic-stockfish", fen, 1)).not.toBe(
      fairyStockfishEvaluationCacheKey("atomic-stockfish", fen, 5),
    );
  });
});

describe("withEngineRequestTimeout", () => {
  afterEach(() => vi.useRealTimers());

  it("cancels a request that never settles", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const request = withEngineRequestTimeout(new Promise<never>(() => undefined), onTimeout, 20);

    const rejection = expect(request).rejects.toThrow("Fairy-Stockfish stopped responding");
    await vi.advanceTimersByTimeAsync(20);

    await rejection;
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("clears the watchdog when the request settles", async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();

    await expect(withEngineRequestTimeout(Promise.resolve("d1h5"), onTimeout, 20)).resolves.toBe(
      "d1h5",
    );
    await vi.advanceTimersByTimeAsync(20);

    expect(onTimeout).not.toHaveBeenCalled();
  });
});

describe("disableFirefoxAtomicsWaitAsync", () => {
  it("disables the leaking Firefox implementation used by pthread workers", () => {
    const atomics = { waitAsync: vi.fn() } as unknown as typeof Atomics;

    disableFirefoxAtomicsWaitAsync("Mozilla/5.0 Firefox/145.0", atomics);

    expect((atomics as typeof Atomics & { waitAsync?: unknown }).waitAsync).toBeUndefined();
  });

  it("leaves other browsers unchanged", () => {
    const waitAsync = vi.fn();
    const atomics = { waitAsync } as unknown as typeof Atomics;

    disableFirefoxAtomicsWaitAsync("Mozilla/5.0 Chrome/142.0", atomics);

    expect((atomics as typeof Atomics & { waitAsync?: unknown }).waitAsync).toBe(waitAsync);
  });
});
