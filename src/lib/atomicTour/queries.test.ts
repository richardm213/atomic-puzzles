import { describe, expect, it } from "vitest";

import { summarizeAtomicTourPlayerRanking } from "./queries";

describe("summarizeAtomicTourPlayerRanking", () => {
  it("uses the live snapshot for current rank and the best historical rank for peak", () => {
    expect(
      summarizeAtomicTourPlayerRanking(
        [
          {
            snapshot_date: "2026-10-25",
            player_name: "current-name",
            rank: 8,
            rank_change: 2,
          },
          { snapshot_date: "2025-12-20", player_name: "old-name", rank: 3 },
          { snapshot_date: "2024-12-21", player_name: "old-name", rank: 12 },
        ],
        "2026-10-25",
      ),
    ).toEqual({
      currentRank: 8,
      currentRankChange: 2,
      peakRank: 3,
      peakRankDate: "2025-12-20",
    });
  });

  it("keeps a peak rank when the player is not in the live snapshot", () => {
    expect(
      summarizeAtomicTourPlayerRanking(
        [{ snapshot_date: "2025-12-20", player_name: "former-player", rank: 6 }],
        "2026-10-25",
      ),
    ).toEqual({
      currentRank: null,
      currentRankChange: null,
      peakRank: 6,
      peakRankDate: "2025-12-20",
    });
  });

  it("uses the first date on which the career-high rank was achieved", () => {
    expect(
      summarizeAtomicTourPlayerRanking(
        [
          { snapshot_date: "2026-10-25", player_name: "player", rank: 4 },
          { snapshot_date: "2026-04-12", player_name: "player", rank: 4 },
          { snapshot_date: "2025-12-20", player_name: "player", rank: 9 },
        ],
        "2026-10-25",
      ),
    ).toEqual({
      currentRank: 4,
      currentRankChange: null,
      peakRank: 4,
      peakRankDate: "2026-04-12",
    });
  });
});
