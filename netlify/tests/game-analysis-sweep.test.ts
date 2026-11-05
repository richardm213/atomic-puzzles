import { describe, expect, it } from "vitest";

import { gameAnalysisSweepPositionLimit } from "../features/gameAnalysis/service";

describe("game analysis sweep", () => {
  it("spreads a fixed position budget across the selected jobs", () => {
    expect(gameAnalysisSweepPositionLimit(1)).toBe(600);
    expect(gameAnalysisSweepPositionLimit(3)).toBe(200);
    expect(gameAnalysisSweepPositionLimit(12)).toBe(50);
  });
});
