import { describe, expect, it } from "vitest";

import {
  gameAnalysisPositionKey,
  gameAnalysisSubmissionLimit,
  gameAnalysisSweepPositionLimit,
} from "../features/gameAnalysis/service";

describe("game analysis sweep", () => {
  it("spreads a fixed position budget across the selected jobs", () => {
    expect(gameAnalysisSweepPositionLimit(1)).toBe(600);
    expect(gameAnalysisSweepPositionLimit(3)).toBe(200);
    expect(gameAnalysisSweepPositionLimit(12)).toBe(50);
  });

  it("fills Gannet's queue without crossing its safety target", () => {
    expect(gameAnalysisSubmissionLimit(0)).toBe(4250);
    expect(gameAnalysisSubmissionLimit(1000)).toBe(3800);
    expect(gameAnalysisSubmissionLimit(4800)).toBe(0);
  });

  it("deduplicates positions whose FEN clocks differ", () => {
    expect(gameAnalysisPositionKey("8/8/8/8/8/8/8/K6k w - - 0 1")).toBe(
      gameAnalysisPositionKey("8/8/8/8/8/8/8/K6k w - - 42 99"),
    );
  });
});
