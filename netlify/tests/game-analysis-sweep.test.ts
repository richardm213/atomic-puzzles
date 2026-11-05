import { describe, expect, it } from "vitest";

import {
  gameAnalysisPollIndexes,
  gameAnalysisPollSchedule,
  gameAnalysisPositionKey,
  gameAnalysisSubmissionLimit,
  gameAnalysisSweepPositionLimit,
  uniqueGameAnalysisPositionIndexes,
} from "../features/gameAnalysis/service";

describe("game analysis sweep", () => {
  it("spreads a fixed position budget across the selected jobs", () => {
    expect(gameAnalysisSweepPositionLimit(1)).toBe(600);
    expect(gameAnalysisSweepPositionLimit(3)).toBe(200);
    expect(gameAnalysisSweepPositionLimit(12)).toBe(50);
    expect(gameAnalysisSweepPositionLimit(600)).toBe(1);
  });

  it("fills Gannet's queue without crossing its safety target", () => {
    expect(gameAnalysisSubmissionLimit(0)).toBe(4250);
    expect(gameAnalysisSubmissionLimit(1000)).toBe(3800);
    expect(gameAnalysisSubmissionLimit(4800)).toBe(0);
  });

  it("rotates the polled position when a large queue gives each job one lookup", () => {
    expect(gameAnalysisPollIndexes([1, 2, 4], 1, 0)).toEqual([1]);
    expect(gameAnalysisPollIndexes([1, 2, 4], 1, 1)).toEqual([2]);
    expect(gameAnalysisPollIndexes([1, 2, 4], 1, 2)).toEqual([4]);
    expect(gameAnalysisPollIndexes([1, 2, 4], 1, 3)).toEqual([1]);
  });

  it("does not let submission-only passes postpone the next progress poll", () => {
    expect(gameAnalysisPollSchedule(false, 4, 120_000, 1_000)).toEqual({});
    expect(gameAnalysisPollSchedule(true, 5, 120_000, 1_000)).toEqual({
      retry_count: 5,
      next_check_at: new Date(121_000).toISOString(),
    });
  });

  it("deduplicates positions whose FEN clocks differ", () => {
    expect(gameAnalysisPositionKey("8/8/8/8/8/8/8/K6k w - - 0 1")).toBe(
      gameAnalysisPositionKey("8/8/8/8/8/8/8/K6k w - - 42 99"),
    );
  });

  it("writes each normalized position only once per shared-position upsert", () => {
    const states = [
      { fen: "8/8/8/8/8/8/8/K6k w - - 0 1" },
      { fen: "8/8/8/8/8/8/8/K6k w - - 42 99" },
      { fen: "8/8/8/8/8/8/8/K5Qk b - - 0 1" },
    ];

    expect(uniqueGameAnalysisPositionIndexes(states, [0, 1, 2])).toEqual([1, 2]);
  });
});
