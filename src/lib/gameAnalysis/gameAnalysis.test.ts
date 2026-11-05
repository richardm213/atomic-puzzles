import { describe, expect, it } from "vitest";

import {
  buildGameAnalysisSummary,
  parseStoredAtomicDbPosition,
  type StoredAtomicDbPosition,
} from "../../../shared/domain/gameAnalysis";

const position = (fen: string, cp: number, bestMove: string): StoredAtomicDbPosition => ({
  fen,
  key: null,
  status: "UNKNOWN",
  closure: null,
  score: cp,
  point: cp,
  bestMove,
  budgetNodes: 128_000_000,
  lines: [{ move: bestMove, cp, mate: null, depth: 30, nodes: 128_000_000, pv: [bestMove] }],
});

describe("AtomicDB game analysis classification", () => {
  it("uses AtomicDB's reported searched nodes when budget_nodes is null", () => {
    const parsed = parseStoredAtomicDbPosition("8/8/8/8/8/8/8/K6k w - - 0 1", {
      status: "UNKNOWN",
      nodes: 12_000_006_934,
      analysis: {
        budget_nodes: null,
        nodes: 12_000_006_934,
        lines: [{ move: "a1a2", cp: 10, nodes: 10_000_006_934, pv: ["a1a2"] }],
      },
    });

    expect(parsed?.budgetNodes).toBe(12_000_006_934);
  });

  it("classifies loss from the mover's perspective and lowers only that player's accuracy", () => {
    const summary = buildGameAnalysisSummary(
      ["e2e4", "e7e5"],
      [
        position("8/8/8/8/8/8/4P3/4K2k w - - 0 1", 400, "e2e3"),
        position("8/8/8/8/4P3/8/8/4K2k b - - 0 1", 400, "h1g1"),
        position("8/8/8/4p3/4P3/8/8/4K2k w - - 0 2", -400, "e1d1"),
      ],
    );

    expect(summary.assessments[0]?.classification).toBe("blunder");
    expect(summary.assessments[1]?.classification).toBe("best");
    expect(summary.whiteAccuracy).toBeLessThan(summary.blackAccuracy);
    expect(summary.whiteAverageCentipawnLoss).toBe(800);
    expect(summary.blackAverageCentipawnLoss).toBe(0);
    expect(summary.evaluations).toEqual([400, -400, -400]);
  });

  it("does not create excellent or good move categories", () => {
    const summary = buildGameAnalysisSummary(
      ["e2e4"],
      [
        position("8/8/8/8/8/8/4P3/4K2k w - - 0 1", 0, "e2e3"),
        position("8/8/8/8/4P3/8/8/4K2k b - - 0 1", 44, "h1g1"),
      ],
    );

    expect(summary.assessments[0]?.classification).toBe("best");
    expect(summary.whiteCounts.excellent).toBe(0);
    expect(summary.whiteCounts.good).toBe(0);
  });
});
