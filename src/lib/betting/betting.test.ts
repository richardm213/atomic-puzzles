import { describe, expect, it } from "vitest";

import {
  findCurrentTournamentOpponent,
  isAwcNotToWinSelfBet,
  isRestrictedAwcChampionOrder,
  maxTournamentBetStake,
  quoteTournamentBet,
} from "./betting";

describe("isAwcNotToWinSelfBet", () => {
  it("blocks only a player's own selection in the AWC not-to-win market", () => {
    expect(isAwcNotToWinSelfBet("awc2026-winner-no", "Actual_User", "actual_user")).toBe(true);
    expect(isAwcNotToWinSelfBet("awc2027-winner-no", "Actual_User", "actual_user")).toBe(true);
    expect(isAwcNotToWinSelfBet("awc2026-winner-no", "Actual_User", "another_player")).toBe(false);
    expect(isAwcNotToWinSelfBet("awc2026-winner", "Actual_User", "actual_user")).toBe(false);
  });
});

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
});

describe("quoteTournamentBet", () => {
  it("adds the two percent fee to the upfront cost", () => {
    expect(quoteTournamentBet(100, 70)).toEqual({
      stake: 100,
      fee: 2,
      totalCost: 102,
      potentialPayout: 142.857143,
      potentialProfit: 40.857143,
    });
  });

  it("uses the locked cents price to calculate the payout", () => {
    expect(quoteTournamentBet(100, 30)).toMatchObject({
      totalCost: 102,
      potentialPayout: 333.333333,
      potentialProfit: 231.333333,
    });
  });
});

describe("maxTournamentBetStake", () => {
  it("caps each position at 50 percent of net worth", () => {
    expect(maxTournamentBetStake(500, 500, 500)).toBe(0);
    expect(maxTournamentBetStake(700, 300, 300)).toBe(196);
    expect(maxTournamentBetStake(700, 300, 0)).toBe(490);
    expect(quoteTournamentBet(196, 50).totalCost + 300).toBeLessThanOrEqual(500);
    expect(quoteTournamentBet(197, 50).totalCost + 300).toBeGreaterThan(500);
  });

  it("increases as the available balance increases", () => {
    expect(maxTournamentBetStake(720, 300, 300)).toBeGreaterThan(
      maxTournamentBetStake(700, 300, 300),
    );
  });

  it("never exceeds the absolute 1,000 coin maximum", () => {
    expect(maxTournamentBetStake(100_000)).toBe(1000);
  });
});
