import { describe, expect, it } from "vitest";

import {
  gameAnalysisPositionKey,
  type GameAnalysisRecord,
} from "../../../shared/domain/gameAnalysis";
import { completedGameAnalysisPositions } from "./preload";

const FEN = "8/8/8/8/8/8/8/K6k w - - 0 1";

describe("completed game analysis preload", () => {
  it("does not present the report search depth as AtomicDB-backed plies", () => {
    const analysis: GameAnalysisRecord = {
      gameId: "game-1",
      status: "ready",
      requestedBy: "user-1",
      totalPositions: 1,
      completedPositions: 1,
      queuedPositions: 0,
      cost: 2,
      error: null,
      result: {
        positions: [
          {
            fen: FEN,
            key: "position-1",
            status: "UNKNOWN",
            closure: null,
            score: 42,
            point: null,
            bestMove: "a1a2",
            budgetNodes: 128_000_000,
            lines: [
              {
                move: "a1a2",
                cp: 42,
                mate: null,
                depth: 26,
                nodes: 64_000_000,
                pv: ["a1a2"],
              },
              {
                move: "a1b1",
                cp: 18,
                mate: null,
                depth: 26,
                nodes: 64_000_000,
                pv: ["a1b1"],
              },
            ],
          },
        ],
        assessments: [],
        evaluations: [42],
        whiteAccuracy: 100,
        blackAccuracy: 100,
        whiteAverageCentipawnLoss: 0,
        blackAverageCentipawnLoss: 0,
        whiteCounts: {
          best: 0,
          excellent: 0,
          good: 0,
          inaccuracy: 0,
          mistake: 0,
          blunder: 0,
        },
        blackCounts: {
          best: 0,
          excellent: 0,
          good: 0,
          inaccuracy: 0,
          mistake: 0,
          blunder: 0,
        },
      },
      createdAt: "2026-11-04T00:00:00.000Z",
      updatedAt: "2026-11-04T00:00:00.000Z",
      completedAt: "2026-11-04T00:00:00.000Z",
    };

    const key = gameAnalysisPositionKey(FEN);
    const cached = completedGameAnalysisPositions(analysis)?.get(key);
    expect(cached?.position?.moves.map((move) => move.nodeBackedPlies)).toEqual([null, null]);
    expect(cached?.position?.moves.map((move) => move.searchDepth)).toEqual([26, 26]);
    expect(cached?.complete).toBe(false);

    const stored = analysis.result!.positions[0]!;
    stored.variationPlies = 5;
    stored.lines[1]!.pv = ["a1b1", "h1h2"];
    const completed = completedGameAnalysisPositions(analysis)?.get(key);
    expect(completed?.complete).toBe(true);
    expect(completed?.principalVariations.a1b1).toEqual(["a1b1", "h1h2"]);
    expect(completedGameAnalysisPositions(null)).toBeUndefined();
  });
});
