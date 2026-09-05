import { describe, expect, it } from "vitest";

import type { Mode } from "../../constants/matches";
import { profileQueryKeys, uniqueMonthRankPairs } from "./profileQueries";

describe("profile query keys", () => {
  it("keeps all profile server state under one invalidation prefix", () => {
    expect(profileQueryKeys.monthRanks("alice").slice(0, 2)).toEqual(["profile", "alice"]);
    expect(
      profileQueryKeys
        .matchHistory(
          "alice",
          "blitz",
          {
            opponentRatingMin: 0,
            opponentRatingMax: 3000,
            opponentFilter: "",
            startDateFilter: "",
            endDateFilter: "",
            sourceFilters: {
              arena: true,
              friend: true,
              lobby: true,
              swiss: true,
              chesscom: true,
              unknown: true,
            },
            timeControlInitialFilter: "all",
            timeControlIncrementFilter: "all",
          },
          1,
          25,
        )
        .slice(0, 3),
    ).toEqual(["profile", "alice", "match-history"]);
  });

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
