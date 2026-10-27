import { describe, expect, it } from "vitest";

import { buildPredictionBook, type PredictionBookOrder } from "../features/betting/predictionBook";

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
});
