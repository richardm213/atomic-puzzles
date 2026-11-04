import { beforeEach, describe, expect, it, vi } from "vitest";

import { analysisHandoffUrl, readAnalysisHandoff, saveAnalysisHandoff } from "./handoff";

describe("analysis handoff", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("round-trips the puzzle PGN and active branch position", () => {
    saveAnalysisHandoff("handoff-1", {
      fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
      pgn: "1. Ka2 (1. Kb2)",
      line: 1,
      ply: 1,
      orientation: "black",
    });

    expect(readAnalysisHandoff("?handoff=handoff-1")).toMatchObject({
      pgn: "1. Ka2 (1. Kb2)",
      line: 1,
      ply: 1,
      orientation: "black",
    });
  });

  it("ignores expired handoffs", () => {
    vi.useFakeTimers();
    saveAnalysisHandoff("old", {
      fen: "8/8/8/8/8/8/8/K6k w - - 0 1",
      pgn: "1. Ka2",
      line: 0,
      ply: 0,
      orientation: "white",
    });
    vi.advanceTimersByTime(11 * 60 * 1000);

    expect(readAnalysisHandoff("?handoff=old")).toBeNull();
  });

  it("builds an analysis URL that keeps the puzzle FEN visible", () => {
    expect(analysisHandoffUrl("8/8/8/8/8/8/8/K6k w - - 0 1", "handoff 1")).toBe(
      "/analysis/8/8/8/8/8/8/8/K6k_w_-_-_0_1?handoff=handoff%201",
    );
  });
});
