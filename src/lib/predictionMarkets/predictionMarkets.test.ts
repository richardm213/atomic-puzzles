import { describe, expect, it } from "vitest";

import {
  formatPredictionShares,
  type PredictionMarketState,
  predictionMarketStateResultSchema,
  predictionMarketVolume,
  predictionTakerFee,
  quotePredictionBuy,
  quotePredictionSell,
} from "./predictionMarkets";

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

describe("formatPredictionShares", () => {
  it("shows at most hundredths without trailing zeroes", () => {
    expect(formatPredictionShares(501)).toBe("501");
    expect(formatPredictionShares(12.5)).toBe("12.5");
    expect(formatPredictionShares(12.345)).toBe("12.35");
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
