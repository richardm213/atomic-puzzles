import { describe, expect, it } from "vitest";

import { maxTournamentBetStake, quoteTournamentBet } from "./betting";

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
