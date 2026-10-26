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
  it("caps the full upfront cost at 25 percent of the balance", () => {
    expect(maxTournamentBetStake(1000)).toBe(245);
    expect(quoteTournamentBet(245, 50).totalCost).toBeLessThanOrEqual(250);
    expect(quoteTournamentBet(246, 50).totalCost).toBeGreaterThan(250);
  });

  it("never exceeds the absolute 1,000 coin maximum", () => {
    expect(maxTournamentBetStake(100_000)).toBe(1000);
  });
});
