import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import type { PredictionMarketState } from "../../lib/predictionMarkets/predictionMarkets";
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

const predictionState = (
  id: string,
  status: PredictionMarketState["market"]["status"],
): PredictionMarketState => ({
  market: {
    id,
    question: "Who will win?",
    resolutionRules: "",
    resolutionSourceUrl: "https://example.com",
    closesAt: "2026-11-10T00:00:00Z",
    status,
    outcome: status === "resolved" ? "yes" : null,
    settlementPriceCents: null,
    settlementReferenceFillId: null,
    resolvedAt: status === "resolved" ? "2026-11-01T00:00:00Z" : null,
    sportsbookVolumeCoins: 0,
    exchangeVolumeCoins: 0,
  },
  book: { yes: { bids: [], asks: [] }, no: { bids: [], asks: [] } },
  fills: [],
  positions: [],
  orders: [],
});

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
              {
                id: "awc-r16-rechesster-renaudmerle",
                username: "rechesster",
                countryCode: "AT",
                outcomeLabels: { yes: "rechesster", no: "renaudmerle" },
              },
            ],
          },
        ]}
        predictionMarketStates={[
          predictionState("awc-r16-natso-crepuscular", "open"),
          predictionState("awc-r16-rechesster-renaudmerle", "resolved"),
        ]}
        countryByPlayer={{}}
        myBetsLoading={false}
        allBetsLoading={false}
        myBetsError={null}
        allBetsError={null}
      />,
    );

    expect(screen.getByLabelText("Status")).toHaveValue("open");

    await user.type(screen.getByLabelText("Bettor"), "buyer");
    await user.selectOptions(screen.getByLabelText("Market"), "awc-r16-natso-crepuscular");
    await user.selectOptions(screen.getByLabelText("Status"), "resolved");

    let searchParams = new URLSearchParams(window.location.search);
    expect(searchParams.get("view")).toBe("all");
    expect(searchParams.get("bettor")).toBe("buyer");
    expect(searchParams.has("strike")).toBe(false);
    expect(searchParams.get("status")).toBe("resolved");
    expect(screen.queryByRole("option", { name: /natso vs crepuscular/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /rechesster vs renaudmerle/i })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Market"), "awc-r16-rechesster-renaudmerle");
    searchParams = new URLSearchParams(window.location.search);
    expect(searchParams.get("strike")).toBe("awc-r16-rechesster-renaudmerle");

    await user.selectOptions(screen.getByLabelText("Status"), "open");
    searchParams = new URLSearchParams(window.location.search);
    expect(searchParams.has("status")).toBe(false);
  });
});
