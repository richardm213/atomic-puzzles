import { describe, expect, it } from "vitest";

import { gameAnalysisSweepPositionLimit } from "../features/gameAnalysis/service";

describe("game analysis sweep", () => {
  it("spreads a fixed position budget across the selected jobs", () => {
    expect(gameAnalysisSweepPositionLimit(1)).toBe(72);
    expect(gameAnalysisSweepPositionLimit(3)).toBe(24);
    expect(gameAnalysisSweepPositionLimit(12)).toBe(6);
  });
});
