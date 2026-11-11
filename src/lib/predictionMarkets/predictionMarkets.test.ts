import { describe, expect, it } from "vitest";

import {
  formatPredictionAveragePrice,
  formatPredictionChance,
  formatPredictionShares,
  isPendingPredictionOrder,
  netPredictionPositions,
  predictionBuyOrderCost,
  predictionMarketCatalogRowSchema,
  predictionMarketGroupsFromRows,
  type PredictionMarketState,
  predictionMarketStateResultSchema,
  predictionMarketVolume,
  predictionTakerFee,
  quotePredictionBuy,
  quotePredictionSell,
  sortPredictionMarketsByChance,
} from "./predictionMarkets";

it("marks only live orders with unfilled contracts as pending", () => {
  const partial = {
    status: "partial" as const,
    remainingQuantity: 80,
    expiresAt: "2099-01-01T00:00:00Z",
  };
  const orders = [
    partial,
    { ...partial, status: "cancelled" as const },
    { ...partial, expiresAt: "2000-01-01T00:00:00Z" },
    { ...partial, remainingQuantity: 0 },
  ];
  expect(orders.filter((order) => isPendingPredictionOrder(order))).toEqual([partial]);
});

describe("formatPredictionChance", () => {
  it("formats sportsbook prices as implied percentages", () => {
    expect(formatPredictionChance(85)).toBe("85%");
    expect(formatPredictionChance(undefined)).toBe("—");
  });
});

describe("formatPredictionAveragePrice", () => {
  it("formats whole and fractional position cost bases", () => {
    expect(formatPredictionAveragePrice(90)).toBe("90¢");
    expect(formatPredictionAveragePrice(33.333333)).toBe("33.3¢");
    expect(formatPredictionAveragePrice(null)).toBeUndefined();
  });
});

describe("quotePredictionBuy", () => {
  it("reports weighted fill price and leaves excess contracts resting", () => {
    const quote = quotePredictionBuy(
      [
        { priceCents: 30, quantity: 10 },
        { priceCents: 35, quantity: 20 },
        { priceCents: 41, quantity: 50 },
      ],
      40,
      40,
    );

    expect(quote).toEqual({
      availableQuantity: 30,
      filledQuantity: 30,
      restingQuantity: 10,
      fillCostCoins: 10,
      averageFillPriceCents: 1000 / 30,
    });
  });

  it("prices a multi-level selection at each executed book level", () => {
    const quote = quotePredictionBuy(
      [
        { priceCents: 80, quantity: 6_156 },
        { priceCents: 83, quantity: 5_883 },
      ],
      83,
      12_039,
    );

    expect(quote.restingQuantity).toBe(0);
    expect(quote.fillCostCoins).toBeCloseTo(9_807.69);
    expect(predictionBuyOrderCost(quote, 83)).toBeCloseTo(10_003.8438);
  });

  it("charges two percent only on the immediately executed value", () => {
    const sellQuote = quotePredictionSell(
      [
        { priceCents: 40, quantity: 5 },
        { priceCents: 35, quantity: 10 },
      ],
      35,
      20,
    );

    expect(sellQuote.proceedsCoins).toBe(5.5);
    expect(sellQuote.restingQuantity).toBe(5);
    expect(predictionTakerFee(sellQuote.proceedsCoins)).toBe(0.11);
    expect(predictionTakerFee(0)).toBe(0);
  });
});

describe("predictionMarketVolume", () => {
  it("uses the stored volume totals instead of recalculating returned fills", () => {
    const state = {
      market: { sportsbookVolumeCoins: 400, exchangeVolumeCoins: 11 },
      fills: [{ priceCents: 99, quantity: 10_000 }],
    } as PredictionMarketState;

    expect(predictionMarketVolume(state)).toBe(411);
  });
});

describe("sortPredictionMarketsByChance", () => {
  it("orders strikes from highest to lowest probability and keeps ties stable", () => {
    const definitions = [
      { id: "low", username: "low", countryCode: "US", startingChance: 10 },
      { id: "high", username: "high", countryCode: "US", startingChance: 70 },
      { id: "tie", username: "tie", countryCode: "US", startingChance: 70 },
      { id: "unknown", username: "unknown", countryCode: "US" },
    ];

    expect(
      sortPredictionMarketsByChance(definitions, new Map()).map((market) => market.id),
    ).toEqual(["high", "tie", "low", "unknown"]);
  });

  it("puts resolved strikes after every open strike", () => {
    const definitions = [
      { id: "resolved", username: "resolved", countryCode: "US", startingChance: 100 },
      { id: "open", username: "open", countryCode: "US", startingChance: 10 },
    ];
    const states = new Map([
      [
        "resolved",
        {
          market: { status: "resolved", outcome: "yes", settlementPriceCents: null },
        } as PredictionMarketState,
      ],
    ]);

    expect(sortPredictionMarketsByChance(definitions, states).map((market) => market.id)).toEqual([
      "open",
      "resolved",
    ]);
  });
});

describe("formatPredictionShares", () => {
  it("shows at most hundredths without trailing zeroes", () => {
    expect(formatPredictionShares(501)).toBe("501");
    expect(formatPredictionShares(12.5)).toBe("12.5");
    expect(formatPredictionShares(12.345)).toBe("12.35");
  });
});

describe("netPredictionPositions", () => {
  it("presents opposing contracts as one net position", () => {
    expect(
      netPredictionPositions([
        {
          outcome: "yes",
          quantity: 500,
          reservedQuantity: 0,
          averagePriceCents: 20,
          updatedAt: "2026-11-04T00:00:00Z",
        },
        {
          outcome: "no",
          quantity: 600,
          reservedQuantity: 0,
          averagePriceCents: 60,
          updatedAt: "2026-11-04T00:00:01Z",
        },
      ]),
    ).toEqual([
      {
        outcome: "no",
        quantity: 100,
        reservedQuantity: 0,
        averagePriceCents: 60,
        updatedAt: "2026-11-04T00:00:01Z",
      },
    ]);
  });
});

describe("prediction market source URLs", () => {
  const market = {
    id: "market",
    question: "Will it happen?",
    resolution_rules: "Resolve from the linked source.",
    resolution_source_url: "https://example.com/result",
    closes_at: "2026-12-01T00:00:00Z",
    status: "open",
    outcome: null,
    settlement_price_cents: null,
    settlement_reference_fill_id: null,
    resolved_at: null,
    sportsbook_volume_coins: 0,
    exchange_volume_coins: 0,
  };

  it("accepts web sources and rejects executable URL schemes", () => {
    expect(predictionMarketStateResultSchema.shape.market.safeParse(market).success).toBe(true);
    expect(
      predictionMarketStateResultSchema.shape.market.safeParse({
        ...market,
        resolution_source_url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      predictionMarketStateResultSchema.shape.market.safeParse({
        ...market,
        resolution_source_url: "data:text/html,unsafe",
      }).success,
    ).toBe(false);
  });
});

it("keeps markets without a display order in the catalog instead of rejecting the whole catalog", () => {
  const rows = [1, null].map((displayOrder, index) =>
    predictionMarketCatalogRowSchema.parse({
      id: `market-${index}`,
      group_id: "champion",
      group_path: "/betting/champion",
      group_title: "Champion",
      group_description: "",
      group_order: 1,
      display_name: `Player${index}`,
      country_code: "US",
      starting_chance: null,
      display_order: displayOrder,
      outcome_yes_label: null,
      outcome_no_label: null,
      outcome_yes_country_code: null,
      outcome_no_country_code: null,
    }),
  );
  expect(predictionMarketGroupsFromRows(rows)[0]?.markets.map((market) => market.id)).toEqual([
    "market-0",
    "market-1",
  ]);
});
