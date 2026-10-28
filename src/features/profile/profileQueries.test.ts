import { describe, expect, it } from "vitest";

import type { Mode } from "../../constants/matches";
import { uniqueMonthRankPairs } from "./profileQueries";

describe("profile query keys", () => {
  it("deduplicates month and mode pairs for the player-count query", () => {
    const ranks: Array<{ monthValue: string; mode: Mode }> = [
      { monthValue: "2026-08-01", mode: "blitz" },
      { monthValue: "2026-08-01", mode: "blitz" },
      { monthValue: "2026-08-01", mode: "bullet" },
    ];

    expect(uniqueMonthRankPairs(ranks)).toEqual([
      { month: "2026-08-01", mode: "blitz" },
      { month: "2026-08-01", mode: "bullet" },
    ]);
  });
});
