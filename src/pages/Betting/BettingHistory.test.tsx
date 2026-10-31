import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

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
  beforeEach(() => {
    window.history.replaceState({}, "", "/betting?view=all");
  });

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
        predictionMarketGroups={[
          {
            id: "awc-2026-round-of-16",
            path: "/betting/awc-2026-round-of-16",
            title: "AWC 2026 Round of 16",
            description: "",
            displayOrder: 1,
            markets: [
              {
                id: "awc-r16-natso-crepuscular",
                username: "natso",
                countryCode: "CA",
                outcomeLabels: { yes: "natso", no: "crepuscular" },
              },
              {
                id: "awc-r16-rechesster-renaudmerle",
                username: "rechesster",
                countryCode: "AT",
                outcomeLabels: { yes: "rechesster", no: "renaudmerle" },
              },
            ],
          },
          {
            id: "november-atomic-shield-2026",
            path: "/betting/november-atomic-shield-2026",
            title: "Who will win the November Atomic Shield?",
            description: "",
            displayOrder: 2,
            markets: [
              {
                id: "november-atomic-shield-2026-rechesster",
                username: "rechesster",
                countryCode: "AT",
              },
            ],
          },
        ]}
        predictionMarketStates={[]}
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
    expect(
      screen.getByRole("option", {
        name: "AWC 2026 Round of 16 · rechesster vs renaudmerle",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /November Atomic Shield/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps all-bets filters in the URL", async () => {
    const user = userEvent.setup();
    render(
      <BettingHistory
        view="all"
        isAuthenticated
        authLoading={false}
        onLogin={() => undefined}
        myBets={[]}
        allBets={[]}
        markets={[]}
        predictionMarketGroups={[
          {
            id: "awc-2026-round-of-16",
            path: "/betting/awc-2026-round-of-16",
            title: "AWC 2026 Round of 16",
            description: "",
            displayOrder: 1,
            markets: [
              {
                id: "awc-r16-natso-crepuscular",
                username: "natso",
                countryCode: "CA",
                outcomeLabels: { yes: "natso", no: "crepuscular" },
              },
            ],
          },
        ]}
        predictionMarketStates={[]}
        countryByPlayer={{}}
        myBetsLoading={false}
        allBetsLoading={false}
        myBetsError={null}
        allBetsError={null}
      />,
    );

    await user.type(screen.getByLabelText("Bettor"), "buyer");
    await user.selectOptions(screen.getByLabelText("Market"), "awc-r16-natso-crepuscular");
    await user.selectOptions(screen.getByLabelText("Status"), "open");

    const searchParams = new URLSearchParams(window.location.search);
    expect(searchParams.get("view")).toBe("all");
    expect(searchParams.get("bettor")).toBe("buyer");
    expect(searchParams.get("strike")).toBe("awc-r16-natso-crepuscular");
    expect(searchParams.get("status")).toBe("open");
  });
});
