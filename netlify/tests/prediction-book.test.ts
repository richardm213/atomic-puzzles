import { describe, expect, it } from "vitest";

import {
  buildPredictionBook,
  calculatePredictionPositionCost,
  type PredictionBookOrder,
  type PredictionPositionFill,
} from "../features/betting/predictionBook";

const order = (overrides: Partial<PredictionBookOrder>): PredictionBookOrder => ({
  outcome: "yes",
  side: "buy",
  price_cents: 10,
  remaining_quantity: 5,
  status: "open",
  ...overrides,
});

describe("prediction order-book normalization", () => {
  it("shows complementary orders as the same economic bid or ask", () => {
    const book = buildPredictionBook([
      order({ outcome: "no", side: "sell", price_cents: 90, remaining_quantity: 500 }),
      order({ outcome: "yes", side: "buy", price_cents: 10, remaining_quantity: 25 }),
      order({ outcome: "yes", side: "sell", price_cents: 33, remaining_quantity: 40 }),
    ]);

    expect(book.yes.bids).toEqual([{ priceCents: 10, quantity: 525 }]);
    expect(book.no.asks).toEqual([{ priceCents: 90, quantity: 525 }]);
    expect(book.yes.asks).toEqual([{ priceCents: 33, quantity: 40 }]);
    expect(book.no.bids).toEqual([{ priceCents: 67, quantity: 40 }]);
  });

  it("keeps average position cost accurate through buys, sells, and paired fills", () => {
    const fill = (
      id: number,
      overrides: Partial<PredictionPositionFill>,
    ): PredictionPositionFill => ({
      id,
      outcome: "yes",
      price_cents: 20,
      quantity: 10,
      buyer_username: "trader",
      seller_username: "maker",
      pair_key: null,
      created_at: `2026-10-27T00:00:0${id}Z`,
      ...overrides,
    });
    const positions = calculatePredictionPositionCost(
      [
        fill(1, {}),
        fill(2, { price_cents: 40 }),
        fill(3, { quantity: 5, buyer_username: "other", seller_username: "trader" }),
        fill(4, { quantity: 5, price_cents: 50 }),
        fill(5, {
          quantity: 5,
          buyer_username: "other",
          seller_username: "trader",
          pair_key: "paired-sell",
        }),
        fill(6, {
          outcome: "no",
          quantity: 5,
          price_cents: 80,
          seller_username: "other",
          pair_key: "paired-sell",
        }),
        fill(7, {
          outcome: "no",
          quantity: 3,
          price_cents: 70,
          seller_username: null,
          pair_key: "paired-buy",
        }),
      ],
      "trader",
    );

    expect(positions.yes).toEqual({ quantity: 15, averagePriceCents: 35 });
    expect(positions.no).toEqual({ quantity: 3, averagePriceCents: 70 });
  });
});
