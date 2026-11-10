import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  gameAnalysisOpeningFens,
  parseStoredAtomicDbPosition,
  unavailableGameAnalysisOpening,
} from "../../shared/domain/gameAnalysis";
import {
  queryGameAnalysisVariations,
  refreshGameAnalysisOpenings,
} from "../features/gameAnalysis/openings";
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

  it("uses the board's 5×5 bundle instead of only the raw engine lines", async () => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1";
    const lines = {
      f7f6: ["f7f6", "b1c3", "g8h6", "g2g4", "c7c6"],
      e7e5: ["e7e5", "e2e4", "b8c6", "g2g3", "d8g5"],
      d7d6: ["d7d6", "f3g5", "f7f6", "b1c3", "c7c6"],
      b8c6: ["b8c6", "f3g5", "f7f5", "g5f7", "e7e6"],
      d7d5: ["d7d5", "f3e5", "f7f6", "e5d7", "e7e6"],
    };
    const fetchResponse = vi.fn<typeof fetch>(async () =>
      Response.json({
        position: {
          moves: Object.keys(lines).map((uci) => ({ uci, score: 20 })),
          analysis: {
            lines: [
              { move: "f7f6", depth: 23, pv: ["f7f6"] },
              { move: "e7e5", depth: 22, pv: lines.e7e5 },
            ],
          },
        },
        lines: { ...lines, e7e5: ["e7e5"] },
        positions: {},
      }),
    );
    const saved = await queryGameAnalysisVariations(fen, AbortSignal.timeout(1000), fetchResponse);
    const requestUrl = new URL(String(fetchResponse.mock.calls[0]?.[0]));
    expect(requestUrl.pathname).toBe("/atomicdb/api/principal-variations");
    expect(Object.fromEntries(requestUrl.searchParams)).toEqual({
      fen,
      line_count: "5",
      ply_count: "5",
    });
    expect(saved?.variationPlies).toBe(5);
    expect(saved?.candidates?.[0]?.depth).toBe(23);
    expect(saved?.candidates?.map(({ pv }) => pv)).toEqual(Object.values(lines));
  });

  it("only refreshes an opening after its own seven-day cache window", async () => {
    const now = new Date("2026-11-09T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    try {
      const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1_000;
      const catalog = [...gameAnalysisOpeningFens()];
      const rows = new Map(
        catalog.map(([key, fen], index) => [
          key,
          {
            fen_key: key,
            data: unavailableGameAnalysisOpening(fen),
            fetched_at: new Date(weekAgo - (index === 1 ? 1 : 0)).toISOString(),
          },
        ]),
      );
      const matchFetchedAt = vi.fn(async () => ({ error: null }));
      const update = vi.fn(() => ({ eq: () => ({ eq: matchFetchedAt }) }));
      const supabase = {
        from: () => ({
          select: () => ({
            in: async (_column: string, keys: string[]) => ({
              data: keys.map((key) => rows.get(key)),
              error: null,
            }),
          }),
          update,
        }),
      } as unknown as SupabaseClient;
      const fetchPosition = vi.fn(async (fen: string) => unavailableGameAnalysisOpening(fen));
      const result = await refreshGameAnalysisOpenings(supabase, fetchPosition);
      const [key, fen] = catalog[1]!;
      expect(fetchPosition.mock.calls).toEqual([[fen]]);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          fen_key: key,
          fetched_at: now.toISOString(),
        }),
      );
      expect(result).toMatchObject({ refreshed: 1, failed: 0 });
    } finally {
      vi.useRealTimers();
    }
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
