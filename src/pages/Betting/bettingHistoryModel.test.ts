import { describe, expect, it } from "vitest";

import type {
  PredictionMarketGroup,
  PredictionMarketState,
} from "../../lib/predictionMarkets/predictionMarkets";
import { buildBetHistory } from "./bettingHistoryModel";

const group: PredictionMarketGroup = {
  id: "awc-2026-champion",
  path: "/betting/awc-2026-champion",
  title: "AWC 2026 champion",
  description: "",
  displayOrder: 1,
  markets: [{ id: "champion-player", username: "player", countryCode: "US" }],
};

const state: PredictionMarketState = {
  market: {
    id: "champion-player",
    question: "Will player win?",
    resolutionRules: "",
    resolutionSourceUrl: "https://example.com",
    closesAt: "2026-11-01T00:00:00Z",
    status: "resolved",
    outcome: "yes",
    settlementPriceCents: null,
    settlementReferenceFillId: null,
    resolvedAt: "2026-10-31T00:00:00Z",
    sportsbookVolumeCoins: 0,
    exchangeVolumeCoins: 0,
  },
  book: { yes: { bids: [], asks: [] }, no: { bids: [], asks: [] } },
  fills: [
    {
      id: 1,
      outcome: "yes",
      priceCents: 60,
      quantity: 10,
      buyerUsername: "buyer",
      sellerUsername: null,
      createdAt: "2026-10-02T00:00:00Z",
    },
    {
      id: 2,
      outcome: "yes",
      priceCents: 50,
      quantity: 10,
      buyerUsername: "buyer",
      sellerUsername: null,
      createdAt: "2026-10-03T00:00:00Z",
    },
    {
      id: 3,
      outcome: "yes",
      priceCents: 50,
      quantity: 1_000,
      buyerUsername: "prediction_admin",
      sellerUsername: null,
      createdAt: "2026-10-04T00:00:00Z",
    },
  ],
  positions: [],
  orders: [],
};

describe("buildBetHistory", () => {
  it("combines prediction fills and excludes liquidity-administration trades", () => {
    expect(
      buildBetHistory({
        tournamentBets: [],
        predictionMarketGroups: [group],
        predictionMarketStates: [state],
      }),
    ).toEqual([
      expect.objectContaining({
        username: "buyer",
        marketId: "champion-player",
        status: "won",
        priceCents: 55,
        totalCost: 11,
        potentialPayout: 20,
        payout: 20,
        placedAt: "2026-10-03T00:00:00Z",
      }),
    ]);
  });
});
