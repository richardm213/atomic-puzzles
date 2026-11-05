import { describe, expect, it } from "vitest";

import {
  gameAnalysisPollIndexes,
  gameAnalysisPositionKey,
  gameAnalysisSubmissionLimit,
  gameAnalysisSweepPositionLimit,
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

  it("deduplicates positions whose FEN clocks differ", () => {
    expect(gameAnalysisPositionKey("8/8/8/8/8/8/8/K6k w - - 0 1")).toBe(
      gameAnalysisPositionKey("8/8/8/8/8/8/8/K6k w - - 42 99"),
    );
  });
});
