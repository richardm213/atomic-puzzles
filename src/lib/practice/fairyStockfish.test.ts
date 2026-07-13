import { describe, expect, it } from "vitest";

import { chooseEngineCandidate, type EngineCandidate } from "./fairyStockfish";

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
});
