import { describe, expect, it } from "vitest";

import {
  buildGameAnalysisSummary,
  evaluationsForPositions,
  GAME_ANALYSIS_INITIAL_REVIEW_PLIES,
  ignoreInitialGameAnalysisPlies,
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
        lines: [{ move: "a1a2", cp: 10, depth: 26, nodes: 10_000_006_934, pv: ["a1a2"] }],
      },
      moves: [
        {
          uci: "a1a2",
          status: "UNKNOWN",
          score: 80,
          point: 10,
          backed_plies: 0,
          node_backed_plies: 4,
        },
        { uci: "a1b1", status: "UNKNOWN", score: 70, point: 8, node_backed_plies: 3 },
        { uci: "a1b2", status: "UNKNOWN", score: 60, point: 6, node_backed_plies: 2 },
        { uci: "a1a3", status: "UNKNOWN", score: 50, point: 4, node_backed_plies: 1 },
        { uci: "a1b3", status: "UNKNOWN", score: 40, point: 2, node_backed_plies: 0 },
        { uci: "a1a4", status: "UNKNOWN", score: 30, point: 0 },
      ],
    });

    expect(parsed?.budgetNodes).toBe(12_000_006_934);
    expect(parsed?.candidates).toHaveLength(5);
    expect(parsed?.candidates?.[0]).toMatchObject({
      move: "a1a2",
      score: 80,
      point: 10,
      nodeBackedPlies: 4,
      depth: 26,
      pv: ["a1a2"],
    });
  });

  it("charts AtomicDB's backed position value instead of the current engine pass", () => {
    const stored = position("8/8/8/8/8/8/8/K6k w - - 0 1", 545, "a1a2");
    stored.score = 1_238;
    stored.point = 545;

    expect(evaluationsForPositions([stored])).toEqual([1_238]);
  });

  it("ignores each player's first move and scores later losses from the mover's perspective", () => {
    const summary = ignoreInitialGameAnalysisPlies(
      buildGameAnalysisSummary(
        ["e2e4", "e7e5", "e1e2", "h1g1"],
        [
          position("8/8/8/8/8/8/4P3/4K2k w - - 0 1", 0, "e2e3"),
          position("8/8/8/8/4P3/8/8/4K2k b - - 0 1", 1, "h1g1"),
          position("8/8/8/4p3/4P3/8/8/4K2k w - - 0 2", 400, "e1d1"),
          position("8/8/8/4p3/4P3/4K3/8/7k b - - 1 2", 400, "h1h2"),
          position("8/8/8/4p3/4P3/4K3/7k/8 w - - 2 3", -400, "e2d3"),
        ],
      ),
      GAME_ANALYSIS_INITIAL_REVIEW_PLIES,
    );

    expect(summary.assessments.map(({ classification }) => classification)).toEqual([
      "best",
      "best",
      "blunder",
      "best",
    ]);
    expect(summary.whiteAccuracy).toBeLessThan(summary.blackAccuracy);
    expect(summary.whiteAverageCentipawnLoss).toBe(800);
    expect(summary.blackAverageCentipawnLoss).toBe(0);
    expect(summary.evaluations).toEqual([0, -1, 400, -400, -400]);
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

  it("excludes Wolfrandom's first three moves per side from negative review", () => {
    const positions = Array.from({ length: 9 }, (_, index) =>
      position(
        `8/8/8/8/8/8/8/K6k ${index % 2 === 0 ? "w" : "b"} - - 0 1`,
        index % 2 === 0 ? 400 : -400,
        "a1a2",
      ),
    );
    const summary = buildGameAnalysisSummary(
      ["a1b1", "h1g1", "b1a1", "g1h1", "a1b1", "h1g1", "b1a1", "g1h1"],
      positions,
    );
    summary.assessments[6] = {
      ...summary.assessments[6]!,
      classification: "blunder",
      symbol: "??",
    };
    summary.assessments[7] = {
      ...summary.assessments[7]!,
      classification: "blunder",
      symbol: "??",
    };
    const wolfrandom = ignoreInitialGameAnalysisPlies(summary, 6);

    expect(
      wolfrandom.assessments.slice(0, 6).every(({ classification }) => classification === "best"),
    ).toBe(true);
    expect(wolfrandom.assessments[6]?.classification).toBe("blunder");
    expect(wolfrandom.whiteCounts.blunder).toBe(1);
    expect(wolfrandom.blackCounts.blunder).toBe(1);
  });
});
