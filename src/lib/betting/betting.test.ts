import { describe, expect, it } from "vitest";

import {
  findCurrentTournamentOpponent,
  isRestrictedAwcChampionOrder,
  isRestrictedPredictionOrder,
} from "./betting";

describe("AWC prediction-market player protections", () => {
  it("finds only an unresolved current opponent", () => {
    expect(
      findCurrentTournamentOpponent(
        [
          { p1: "player", p2: "old_opponent", s1: 6, s2: 2, matchId: "played" },
          { p1: "Player", p2: "current_opponent", s1: 0, s2: 0, matchId: "" },
        ],
        "player",
      ),
    ).toBe("current_opponent");
  });

  it("blocks negative exposure to yourself or your current opponent", () => {
    const base = {
      groupId: "awc-2026-champion",
      username: "player",
      currentOpponent: "opponent",
      side: "buy" as const,
    };
    expect(isRestrictedAwcChampionOrder({ ...base, marketPlayer: "player", outcome: "no" })).toBe(
      "self",
    );
    expect(isRestrictedAwcChampionOrder({ ...base, marketPlayer: "opponent", outcome: "no" })).toBe(
      "opponent",
    );
    expect(
      isRestrictedAwcChampionOrder({ ...base, marketPlayer: "player", outcome: "yes" }),
    ).toBeNull();
    expect(
      isRestrictedAwcChampionOrder({ ...base, marketPlayer: "someone_else", outcome: "no" }),
    ).toBeNull();
  });

  it("lets an R16 player buy themselves but not their opponent", () => {
    const base = {
      groupId: "awc-2026-round-of-16",
      marketPlayer: "player vs opponent",
      yesPlayer: "player",
      noPlayer: "opponent",
      username: "player",
      currentOpponent: "opponent",
    };
    expect(isRestrictedPredictionOrder({ ...base, outcome: "yes", side: "buy" })).toBeNull();
    expect(isRestrictedPredictionOrder({ ...base, outcome: "no", side: "buy" })).toBe("opponent");
    expect(isRestrictedPredictionOrder({ ...base, outcome: "yes", side: "sell" })).toBeNull();
  });
});
