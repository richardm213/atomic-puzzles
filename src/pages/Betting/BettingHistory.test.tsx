import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BettingHistory } from "./BettingHistory";
import type { BetHistoryEntry } from "./bettingHistoryModel";

const roundOf16Bet: BetHistoryEntry = {
  id: 4,
  marketId: "awc-r16-natso-crepuscular",
  username: "buyer",
  selection: "natso vs crepuscular",
  priceCents: 85,
  stake: 569.5,
  fee: 0,
  totalCost: 569.5,
  potentialPayout: 670,
  payout: 0,
  status: "open",
  placedAt: "2026-10-27T20:36:00Z",
  settledAt: null,
  kind: "prediction",
  predictionOutcome: "no",
  predictionSelectionLabel: "crepuscular",
  predictionSelectionCountryCode: "US",
  predictionMarketTitle: "AWC 2026 Round of 16",
};

describe("BettingHistory", () => {
  it("shows only the selected side for named Round of 16 outcomes", () => {
    render(
      <BettingHistory
        view="mine"
        isAuthenticated
        authLoading={false}
        onLogin={() => undefined}
        myBets={[roundOf16Bet]}
        allBets={[]}
        markets={[]}
        countryByPlayer={{}}
        myBetsLoading={false}
        allBetsLoading={false}
        myBetsError={null}
        allBetsError={null}
      />,
    );

    const row = screen.getByRole("row", { name: /crepuscular/i });
    expect(within(row).getByText("crepuscular")).toBeInTheDocument();
    expect(row).not.toHaveTextContent("· No");
    expect(row).not.toHaveTextContent("natso vs crepuscular");
  });
});
