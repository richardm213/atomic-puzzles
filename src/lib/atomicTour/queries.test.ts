import { describe, expect, it } from "vitest";

import { summarizeAtomicTourPlayerRanking } from "./queries";

describe("summarizeAtomicTourPlayerRanking", () => {
  it("uses the live snapshot for current rank and the best historical rank for peak", () => {
    expect(
      summarizeAtomicTourPlayerRanking(
        [
          { snapshot_date: "2026-10-25", player_name: "current-name", rank: 8 },
          { snapshot_date: "2025-12-20", player_name: "old-name", rank: 3 },
          { snapshot_date: "2024-12-21", player_name: "old-name", rank: 12 },
        ],
        "2026-10-25",
      ),
    ).toEqual({ currentRank: 8, peakRank: 3 });
  });

  it("keeps a peak rank when the player is not in the live snapshot", () => {
    expect(
      summarizeAtomicTourPlayerRanking(
        [{ snapshot_date: "2025-12-20", player_name: "former-player", rank: 6 }],
        "2026-10-25",
      ),
    ).toEqual({ currentRank: null, peakRank: 6 });
  });
});
