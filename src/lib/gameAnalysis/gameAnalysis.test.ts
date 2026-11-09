import { INITIAL_FEN } from "chessops/fen";
import { describe, expect, it, vi } from "vitest";

import {
  applyGameAnalysisOpeningReview,
  buildGameAnalysisSummary,
  buildGamePositionFens,
  evaluationsForPositions,
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

  it("ignores White's first two moves and Black's first move without swapping later losses", () => {
    const summary = applyGameAnalysisOpeningReview(
      buildGameAnalysisSummary(
        ["e2e4", "e7e5", "e1e2", "h1g1", "e2d3"],
        [
          position(WHITE_FEN, 0, "e2e3"),
          position(BLACK_FEN, 400, "h1g1"),
          position(WHITE_FEN, 400, "e1d1"),
          position(BLACK_FEN, 400, "h1h2"),
          position(WHITE_FEN, -100, "e2d3"),
          position(BLACK_FEN, 500, "h1h2"),
        ],
      ),
      { wolfrandom: false },
    );

    expect(summary.assessments.map(({ classification }) => classification)).toEqual([
      "best",
      "best",
      "best",
      "mistake",
      "blunder",
    ]);
    expect(summary.whiteCounts.blunder).toBe(1);
    expect(summary.blackCounts.mistake).toBe(1);
    expect(summary.whiteAverageCentipawnLoss).toBe(400);
    expect(summary.blackAverageCentipawnLoss).toBe(300);
    expect(summary.evaluations).toEqual([0, -400, 400, -400, -100, -500]);
  });

  it("skips catalog moves, even if they allow mate, and grades the first move outside the line", () => {
    // Two Knights through 3. g4, then Black deviates with 3…a6.
    const moves = ["g1f3", "f7f6", "b1c3", "g8h6", "g2g4", "a7a6", "d2d4"];
    const scores = [0, 10_000, 0, 0, 300, 400, 10_000, -10_000];
    const positions = buildGamePositionFens(INITIAL_FEN, moves).map((fen, index) =>
      position(fen, scores[index]!, moves[index] ?? "b8c6"),
    );
    const raw = buildGameAnalysisSummary(moves, positions);
    const review = applyGameAnalysisOpeningReview(raw, { wolfrandom: false });

    expect(raw.assessments[0]?.classification).toBe("blunder");
    expect(raw.assessments[4]?.classification).toBe("blunder");
    expect(review.assessments.slice(0, 5).map(({ classification }) => classification)).toEqual(
      Array(5).fill("best"),
    );
    expect(review.assessments[5]?.classification).toBe("blunder");
    expect(review.blackAverageCentipawnLoss).toBe(1400);
    expect(review.whiteAverageCentipawnLoss).toBe(0);
    expect(review.blackAccuracy).toBeLessThan(100);
    expect(review.whiteAccuracy).toBe(100);
    expect(review.evaluations).toEqual(raw.evaluations);
  });

  it("counts a newly allowed opening mate but not a missed mate", () => {
    const forcedMate = position(WHITE_FEN, 0, "e1d1");
    forcedMate.lines[0]!.mate = 1;
    forcedMate.lines[0]!.cp = null;
    const summary = applyGameAnalysisOpeningReview(
      buildGameAnalysisSummary(
        ["e2e4", "e7e5", "e1e2", "h1g1", "e2d3"],
        [
          position(WHITE_FEN, 0, "e2e3"),
          position(BLACK_FEN, 400, "h1g1"),
          forcedMate,
          position(BLACK_FEN, -300, "h1h2"),
          position(WHITE_FEN, 500, "e2d3"),
          position(BLACK_FEN, -200, "h1h2"),
        ],
      ),
      { wolfrandom: false },
    );

    expect(summary.assessments.slice(0, 3).map(({ classification }) => classification)).toEqual([
      "best",
      "blunder",
      "best",
    ]);
    expect(summary.blackCounts.blunder).toBe(1);
    expect(summary.blackAverageCentipawnLoss).toBe(800);
    expect(summary.whiteAverageCentipawnLoss).toBe(300);
  });

  it("grades unrounded Atomic win-chance loss at the 5, 10, and 15 point cutoffs", () => {
    const grades = [122, 123, 248, 249, 379, 380].map(
      (cp) =>
        buildGameAnalysisSummary(
          ["e2e4"],
          [position(WHITE_FEN, 0, "e2e4"), position(BLACK_FEN, cp, "h1g1")],
        ).assessments[0]?.classification,
    );
    expect(grades).toEqual(["best", "inaccuracy", "inaccuracy", "mistake", "mistake", "blunder"]);
  });

  it("grades newly allowed mate using the same win-chance loss thresholds as other moves", () => {
    const after = position(WHITE_FEN, 0, "e2e3");
    after.lines[0]!.mate = 5;
    after.lines[0]!.cp = null;
    const grade = (before: StoredAtomicDbPosition) =>
      buildGameAnalysisSummary(["h1h2"], [before, after]).assessments[0];
    const grades = [-1_000, -1_200, -1_500, -2_000].map(
      (cp) => grade(position(BLACK_FEN, cp, "h1g1"))?.classification,
    );

    expect(grades).toEqual(["blunder", "mistake", "inaccuracy", "best"]);
    expect(grade(position(BLACK_FEN, -1_200, "h1g1"))).toMatchObject({
      winPercentBefore: 12.4,
      winPercentAfter: 0,
      winPercentLoss: 12.4,
    });
    const alreadyMated = position(BLACK_FEN, 0, "h1g1");
    alreadyMated.lines[0]!.mate = -8;
    expect(grade(alreadyMated)).toMatchObject({ classification: "best", winPercentLoss: 0 });
  });

  it("treats a new 100-pawn advantage for either opponent like newly allowed mate", () => {
    const grade = (before: number, after: number) =>
      buildGameAnalysisSummary(
        ["h1h2"],
        [position(BLACK_FEN, before, "h1g1"), position(WHITE_FEN, after, "e2e3")],
      ).assessments[0]?.classification;

    expect(grade(-1_400, 10_000)).toBe("inaccuracy");
    expect(grade(-10_000, 10_000)).toBe("best");

    const whiteBefore = position(WHITE_FEN, -1_200, "e2e3");
    const blackAfter = position(BLACK_FEN, 10_000, "h1g1");
    const whiteGrade = () =>
      buildGameAnalysisSummary(["e2e4"], [whiteBefore, blackAfter]).assessments[0]?.classification;
    expect(whiteGrade()).toBe("mistake");
    blackAfter.lines[0]!.mate = 5;
    expect(whiteGrade()).toBe("mistake");
  });

  it("grades a missed forced mate from a starting win chance of 100%", () => {
    const before = position(WHITE_FEN, 0, "e2e3");
    const after = position(BLACK_FEN, 0, "h1g1");
    const forcedMate = (stored: StoredAtomicDbPosition, winner: 1 | -1) => ({
      ...stored,
      closure: "MATE_PV",
      score: winner * 10_000,
      point: winner * 9_995,
    });
    const grade = (start: StoredAtomicDbPosition, end: StoredAtomicDbPosition) =>
      buildGameAnalysisSummary(["e2e4"], [start, end]).assessments[0];

    const mateBefore = forcedMate(before, 1);
    expect(grade(mateBefore, { ...after, score: -1_200 })).toMatchObject({
      classification: "mistake",
      winPercentBefore: 100,
      winPercentAfter: 87.6,
      winPercentLoss: 12.4,
    });
    expect(grade(mateBefore, forcedMate(after, -1))).toMatchObject({
      classification: "best",
      winPercentLoss: 0,
    });
  });

  it("loads a saved review with updated grades and counts from the saved evaluations", async () => {
    const positions = [position(WHITE_FEN, 0, "e2e3"), position(BLACK_FEN, 169, "h1g1")];
    const legacyCounts = { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 1 };
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
                classification: "blunder",
                symbol: "??",
                winPercentBefore: 50,
                winPercentAfter: 34.9,
                winPercentLoss: 15.1,
                bestMove: "e2e3",
              },
            ],
            evaluations: [0, -169],
            whiteCounts: legacyCounts,
            blackCounts: { ...legacyCounts, blunder: 0 },
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
        classification: "inaccuracy",
        symbol: "?!",
        winPercentLoss: 6.9,
      });
      expect(analysis?.result?.whiteCounts).toMatchObject({ inaccuracy: 1, blunder: 0 });
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
    const wolfrandom = applyGameAnalysisOpeningReview(summary, { wolfrandom: true });

    expect(
      wolfrandom.assessments.slice(0, 6).every(({ classification }) => classification === "best"),
    ).toBe(true);
    expect(wolfrandom.assessments[6]?.classification).toBe("blunder");
    expect(wolfrandom.whiteCounts.blunder).toBe(1);
    expect(wolfrandom.blackCounts.blunder).toBe(1);
  });
});
