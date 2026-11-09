import { describe, expect, it, vi } from "vitest";

import {
  buildGameAnalysisSummary,
  evaluationsForPositions,
  GAME_ANALYSIS_INITIAL_REVIEW_PLIES,
  ignoreInitialGameAnalysisPlies,
  parseStoredAtomicDbPosition,
  type StoredAtomicDbPosition,
} from "../../../shared/domain/gameAnalysis";
import { fetchGameAnalysis } from "./gameAnalysis";

const WHITE_FEN = "8/8/8/8/8/8/4P3/4K2k w - - 0 1";
const BLACK_FEN = "8/8/8/8/4P3/8/8/4K2k b - - 0 1";

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
        {
          uci: "a1b1",
          status: "UNKNOWN",
          score: 70,
          point: 8,
          node_backed_plies: 3,
          search_depth: 24,
        },
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
    expect(parsed?.candidates?.[1]).toMatchObject({
      move: "a1b1",
      depth: 24,
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

  it("grades unrounded win-chance loss at Lichess's 5, 10, and 15 point cutoffs", () => {
    const grades = [54, 55, 110, 111, 168, 169].map(
      (cp) =>
        buildGameAnalysisSummary(
          ["e2e4"],
          [position(WHITE_FEN, 0, "e2e4"), position(BLACK_FEN, cp, "h1g1")],
        ).assessments[0]?.classification,
    );
    expect(grades).toEqual(["best", "inaccuracy", "inaccuracy", "mistake", "mistake", "blunder"]);
  });

  it("grades newly allowed mate from Black's pre-move deficit, not from the mate distance", () => {
    const after = position(WHITE_FEN, 0, "e2e3");
    after.lines[0]!.mate = 5;
    after.lines[0]!.cp = null;
    const grade = (before: StoredAtomicDbPosition) =>
      buildGameAnalysisSummary(["h1h2"], [before, after]).assessments[0]?.classification;
    const grades = [-699, -700, -1_200, -1_500, -1_501].map((cp) =>
      grade(position(BLACK_FEN, cp, "h1g1")),
    );

    expect(grades).toEqual(["blunder", "mistake", "mistake", "mistake", "inaccuracy"]);
    const alreadyMated = position(BLACK_FEN, -10_000, "h1g1");
    alreadyMated.lines[0]!.mate = -8;
    expect(grade(alreadyMated)).toBe("best");
  });

  it("treats a new 100-pawn advantage for either opponent like newly allowed mate", () => {
    const grade = (before: number, after: number) =>
      buildGameAnalysisSummary(
        ["h1h2"],
        [position(BLACK_FEN, before, "h1g1"), position(WHITE_FEN, after, "e2e3")],
      ).assessments[0]?.classification;

    expect(grade(-1_200, 10_000)).toBe("mistake");
    expect(grade(-1_200, 9_999)).toBe("best");
    expect(grade(-10_000, 10_000)).toBe("best");

    const whiteBefore = position(WHITE_FEN, -1_200, "e2e3");
    const blackAfter = position(BLACK_FEN, 10_000, "h1g1");
    const whiteGrade = () =>
      buildGameAnalysisSummary(["e2e4"], [whiteBefore, blackAfter]).assessments[0]?.classification;
    expect(whiteGrade()).toBe("mistake");
    blackAfter.lines[0]!.mate = 5;
    expect(whiteGrade()).toBe("mistake");
  });

  it("grades a missed forced mate by the remaining advantage", () => {
    const before = position(WHITE_FEN, 0, "e2e3");
    const after = position(BLACK_FEN, 0, "h1g1");
    const forcedMate = (stored: StoredAtomicDbPosition, winner: 1 | -1) => ({
      ...stored,
      closure: "MATE_PV",
      score: winner * 10_000,
      point: winner * 9_995,
    });
    const grade = (start: StoredAtomicDbPosition, end: StoredAtomicDbPosition) =>
      buildGameAnalysisSummary(["e2e4"], [start, end]).assessments[0]?.classification;

    const mateBefore = forcedMate(before, 1);
    const grades = [-699, -700, -1_200, -1_500, -1_501, -10_000].map((score) =>
      grade(mateBefore, { ...after, score }),
    );
    expect(grades).toEqual(["blunder", "mistake", "mistake", "mistake", "inaccuracy", "best"]);
    expect(grade({ ...before, score: 10_000 }, { ...after, score: -1_200 })).toBe("mistake");
    expect(grade(forcedMate(before, 1), forcedMate(after, -1))).toBe("best");
  });

  it("loads a saved review with updated grades and counts from the saved evaluations", async () => {
    const positions = [position(WHITE_FEN, 0, "e2e3"), position(BLACK_FEN, 169, "h1g1")];
    const legacyCounts = { best: 0, excellent: 0, good: 0, inaccuracy: 1, mistake: 0, blunder: 0 };
    const fetchReview = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        analysis: {
          gameId: "example",
          status: "ready",
          requestedBy: "player",
          totalPositions: 2,
          completedPositions: 2,
          queuedPositions: 2,
          cost: 1,
          error: null,
          result: {
            positions,
            assessments: [
              {
                ply: 1,
                uci: "e2e4",
                classification: "inaccuracy",
                symbol: "?!",
                winPercentBefore: 50,
                winPercentAfter: 34.9,
                winPercentLoss: 15.1,
                bestMove: "e2e3",
              },
            ],
            evaluations: [0, -169],
            whiteCounts: legacyCounts,
            blackCounts: { ...legacyCounts, inaccuracy: 0 },
          },
          createdAt: "",
          updatedAt: "",
          completedAt: "",
        },
      }),
    );
    try {
      const analysis = await fetchGameAnalysis("example");
      expect(analysis?.result?.assessments[0]).toMatchObject({
        classification: "blunder",
        symbol: "??",
      });
      expect(analysis?.result?.whiteCounts).toMatchObject({ inaccuracy: 0, blunder: 1 });
      expect(fetchReview).toHaveBeenCalledTimes(1);
    } finally {
      fetchReview.mockRestore();
    }
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
