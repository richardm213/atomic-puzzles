import { describe, expect, it } from "vitest";

import { parseStoredAtomicDbPosition } from "../../shared/domain/gameAnalysis";
import {
  gameAnalysisNeedsSubmission,
  gameAnalysisPollIndexes,
  gameAnalysisPollSchedule,
  gameAnalysisPositionKey,
  gameAnalysisRequestParameters,
  gameAnalysisSubmissionLimit,
  gameAnalysisSweepPositionLimit,
  isCompletedAtomicDbPosition,
  parseAtomicDbQueueSize,
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

  it("falls back to AtomicDB's anonymous request API when credentials are not configured", () => {
    expect(Object.fromEntries(gameAnalysisRequestParameters("example fen", null))).toEqual({
      fen: "example fen",
      only_if_missing: "1",
    });
    expect(
      Object.fromEntries(
        gameAnalysisRequestParameters("example fen", {
          username: "queue-user",
          password: "queue-password",
        }),
      ),
    ).toEqual({
      fen: "example fen",
      only_if_missing: "1",
      username: "queue-user",
      password: "queue-password",
    });
  });

  it("reads both current and legacy AtomicDB queue counters", () => {
    expect(
      parseAtomicDbQueueSize(
        '<p class="queue-counts"><span><strong>67</strong> waiting</span> <span><strong>3</strong> running</span></p>',
      ),
    ).toBe(70);
    expect(
      parseAtomicDbQueueSize(
        '<div class="v">4,700</div><div class="l">waiting</div><div class="v">3</div><div class="l">running</div>',
      ),
    ).toBe(4703);
  });

  it("skips jobs whose positions have all been submitted", () => {
    expect(gameAnalysisNeedsSubmission({ queued_positions: 54, total_positions: 54 })).toBe(false);
    expect(gameAnalysisNeedsSubmission({ queued_positions: 5, total_positions: 91 })).toBe(true);
  });

  it("finishes a below-budget search with a backed mate, but not an unconfirmed score", () => {
    const fen = "r4k2/1p2R3/2p5/p2p4/2B5/2P5/1Pn2P2/2K3R1 b - - 8 24";
    const query = { status: "UNKNOWN", score: -10_000, best_move: "d5c4" };
    const analysis = {
      budget_nodes: 46_288,
      lines: [{ move: "d5c4", mate: -1, pv: ["d5c4", "g1g8"] }],
    };
    expect(
      isCompletedAtomicDbPosition(parseStoredAtomicDbPosition(fen, { ...query, analysis })),
    ).toBe(true);
    expect(isCompletedAtomicDbPosition(parseStoredAtomicDbPosition(fen, query))).toBe(false);
  });

  it("rotates the polled position when a large queue gives each job one lookup", () => {
    expect(gameAnalysisPollIndexes([1, 2, 4], 1, 0)).toEqual([1]);
    expect(gameAnalysisPollIndexes([1, 2, 4], 1, 1)).toEqual([2]);
    expect(gameAnalysisPollIndexes([1, 2, 4], 1, 2)).toEqual([4]);
    expect(gameAnalysisPollIndexes([1, 2, 4], 1, 3)).toEqual([1]);
  });

  it("does not let submission-only passes postpone the next progress poll", () => {
    expect(gameAnalysisPollSchedule(false, 4, 120_000, 1_000)).toEqual({
      next_check_at: new Date(1_000).toISOString(),
    });
    expect(gameAnalysisPollSchedule(true, 5, 120_000, 1_000)).toEqual({
      retry_count: 5,
      last_checked_at: new Date(1_000).toISOString(),
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
