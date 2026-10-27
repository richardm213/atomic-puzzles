import { describe, expect, it } from "vitest";

import { predictionTakerFee, quotePredictionBuy, quotePredictionSell } from "./predictionMarkets";

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
