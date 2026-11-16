import { describe, expect, it } from "vitest";

import type { TournamentBet } from "../../lib/betting/betting";
import type {
  PredictionMarketGroup,
  PredictionMarketState,
} from "../../lib/predictionMarkets/predictionMarkets";
import { buildBetHistory, predictionPnlByMarketId } from "./bettingHistoryModel";

const group: PredictionMarketGroup = {
  id: "awc-2026-champion",
  path: "/betting/awc-2026-champion",
  title: "Who will win 2026 AWC",
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

const roundOf16Group: PredictionMarketGroup = {
  id: "awc-2026-round-of-16",
  path: "/betting/awc-2026-round-of-16",
  title: "AWC 2026 Round of 16",
  description: "",
  displayOrder: 2,
  markets: [
    {
      id: "awc-r16-natso-crepuscular",
      username: "natso vs crepuscular",
      countryCode: "US",
      outcomeLabels: { yes: "natso", no: "crepuscular" },
      outcomeCountryCodes: { yes: "CA", no: "US" },
    },
  ],
};

const roundOf16State: PredictionMarketState = {
  ...state,
  market: {
    ...state.market,
    id: "awc-r16-natso-crepuscular",
    question: "Who will win?",
    status: "open",
    outcome: null,
    resolvedAt: null,
  },
  fills: [
    {
      id: 4,
      outcome: "no",
      priceCents: 85,
      quantity: 670,
      buyerUsername: "buyer",
      sellerUsername: null,
      createdAt: "2026-10-27T20:36:00Z",
    },
  ],
};

const tournamentBet = (id: number, marketId: string): TournamentBet => ({
  id,
  marketId,
  username: "buyer",
  selection: "player",
  priceCents: 55,
  stake: 11,
  fee: 0,
  totalCost: 11,
  potentialPayout: 20,
  payout: 0,
  status: "open",
  placedAt: "2026-10-01T00:00:00Z",
  settledAt: null,
});

describe("buildBetHistory", () => {
  it("uses the server's net position without mixing sold shares into current cost", () => {
    const position = {
      marketId: "champion-player",
      username: "buyer",
      outcome: "no" as const,
      quantity: 10,
      reservedQuantity: 0,
      averagePriceCents: 60,
      closedCost: 4,
      closedProceeds: 6,
      fees: 0.1,
      updatedAt: "2026-10-06T00:00:00Z",
    };
    const build = (market: PredictionMarketState["market"], exited = false) =>
      buildBetHistory({
        tournamentBets: [],
        predictionPositions: [
          exited ? { ...position, quantity: 0, closedCost: 10, closedProceeds: 15 } : position,
          { ...position, username: "someone-else" },
          { ...position, marketId: "awc-r16-natso-crepuscular" },
        ],
        predictionMarketGroups: [group, roundOf16Group],
        predictionMarketStates: [{ ...state, market }, roundOf16State],
      });
    const live = build({ ...state.market, status: "open", outcome: null, resolvedAt: null });
    expect(live).toHaveLength(3);
    const summary = live.find(
      (bet) => bet.username === "buyer" && bet.marketId === "champion-player",
    )!;
    expect(summary).toMatchObject({
      status: "open",
      predictionOutcome: "no",
      totalCost: 6,
      payout: 6,
      potentialPayout: 16,
      realizedPnl: 1.9,
      pnl: 5.9,
    });
    expect(predictionPnlByMarketId([summary]).get("champion-player")).toBeCloseTo(1.9);
    const settled = build({ ...state.market, outcome: "no" }).find(
      (bet) => bet.historyKey === summary.historyKey,
    )!;
    expect(settled).toMatchObject({ status: "won", payout: 16, totalCost: 6, pnl: 5.9 });
    expect(predictionPnlByMarketId([settled]).get("champion-player")).toBeCloseTo(5.9);
    const exited = build(
      { ...state.market, status: "open", outcome: null, resolvedAt: null },
      true,
    ).find((bet) => bet.historyKey === summary.historyKey)!;
    expect(exited).toMatchObject({
      status: "settled",
      payout: 15,
      totalCost: 0,
      realizedPnl: 4.9,
      pnl: 4.9,
    });
  });

  it("keeps realized sales and fees in live and final P&L, including fully exited traders", () => {
    const positions = [
      {
        marketId: "champion-player",
        username: "partial",
        outcome: "yes" as const,
        quantity: 5,
        reservedQuantity: 0,
        averagePriceCents: 20,
        closedCost: 1,
        closedProceeds: 3,
        fees: 0.15,
        updatedAt: "2026-10-05T00:00:00Z",
      },
      {
        marketId: "champion-player",
        username: "exited",
        outcome: "no" as const,
        quantity: 0,
        reservedQuantity: 0,
        averagePriceCents: 40,
        closedCost: 0.4,
        closedProceeds: 0.6,
        fees: 0.02,
        updatedAt: "2026-10-05T00:00:00Z",
      },
    ];
    const historyFor = (market: PredictionMarketState["market"]) =>
      buildBetHistory({
        tournamentBets: [],
        predictionPositions: positions,
        predictionMarketGroups: [group],
        predictionMarketStates: [{ ...state, market }],
      });
    const live = historyFor({ ...state.market, status: "open", outcome: null, resolvedAt: null });
    expect(live).toHaveLength(2);
    expect(live.find((bet) => bet.username === "partial")).toMatchObject({
      totalCost: 1,
      payout: 3,
      potentialPayout: 8,
      realizedPnl: 1.85,
      status: "open",
    });
    expect(live.find((bet) => bet.username === "exited")).toMatchObject({
      status: "settled",
      totalCost: 0,
      payout: 0.6,
    });
    expect(predictionPnlByMarketId(live).get("champion-player")).toBeCloseTo(2.03);
    const resolved = historyFor(state.market);
    expect(resolved.find((bet) => bet.username === "partial")?.payout).toBe(8);
    expect(predictionPnlByMarketId(resolved).get("champion-player")).toBeCloseTo(6.03);
    const lost = historyFor({ ...state.market, outcome: "no" });
    expect(predictionPnlByMarketId(lost).get("champion-player")).toBeCloseTo(1.03);
  });

  it("uses the current position quantity, cost basis, and update date", () => {
    expect(
      buildBetHistory({
        tournamentBets: [],
        predictionPositions: [
          {
            marketId: "champion-player",
            username: "buyer",
            outcome: "yes",
            quantity: 20,
            reservedQuantity: 0,
            averagePriceCents: 55,
            updatedAt: "2026-10-05T00:00:00Z",
          },
          {
            marketId: "champion-player",
            username: "tiny-position",
            outcome: "yes",
            quantity: 1,
            reservedQuantity: 0,
            averagePriceCents: 99,
            updatedAt: "2026-10-06T00:00:00Z",
          },
        ],
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
        placedAt: "2026-10-05T00:00:00Z",
      }),
    ]);
  });

  it("labels Round of 16 history with the selected player instead of Yes or No", () => {
    expect(
      buildBetHistory({
        tournamentBets: [],
        predictionPositions: [
          {
            marketId: "awc-r16-natso-crepuscular",
            username: "buyer",
            outcome: "no",
            quantity: 670,
            reservedQuantity: 0,
            averagePriceCents: 85,
            updatedAt: "2026-10-28T00:00:00Z",
          },
        ],
        predictionMarketGroups: [roundOf16Group],
        predictionMarketStates: [roundOf16State],
      }),
    ).toEqual([
      expect.objectContaining({
        selection: "natso vs crepuscular",
        predictionOutcome: "no",
        predictionSelectionLabel: "crepuscular",
        predictionSelectionCountryCode: "US",
        predictionMarketTitle: "AWC 2026 Round of 16",
      }),
    ]);
  });

  it("uses positions as the single source for migrated markets without hiding unrelated bets", () => {
    const history = buildBetHistory({
      tournamentBets: [tournamentBet(1, "awc2026-winner"), tournamentBet(2, "other-market")],
      predictionPositions: [
        {
          marketId: "champion-player",
          username: "buyer",
          outcome: "yes",
          quantity: 20,
          reservedQuantity: 0,
          averagePriceCents: 55,
          updatedAt: "2026-10-05T00:00:00Z",
        },
      ],
      predictionMarketGroups: [group],
      predictionMarketStates: [state],
    });

    expect(history.map((bet) => bet.marketId)).toEqual(["champion-player", "other-market"]);
  });
});
