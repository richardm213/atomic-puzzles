import { describe, expect, it } from "vitest";

import {
  type PredictionPositionFill,
  replayPredictionPosition,
} from "../../shared/domain/predictionAccounting";
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

  it("uses separate sportsbook bid and ask prices without locking the book", () => {
    const book = buildPredictionBook([
      order({ outcome: "yes", side: "buy", price_cents: 26, remaining_quantity: 1_352 }),
      order({ outcome: "no", side: "buy", price_cents: 70, remaining_quantity: 3_334 }),
    ]);

    expect(book.yes).toEqual({
      bids: [{ priceCents: 26, quantity: 1_352 }],
      asks: [{ priceCents: 30, quantity: 3_334 }],
    });
    expect(book.no).toEqual({
      bids: [{ priceCents: 70, quantity: 3_334 }],
      asks: [{ priceCents: 74, quantity: 1_352 }],
    });
    expect(book.yes.bids[0]!.priceCents).toBeLessThan(book.yes.asks[0]!.priceCents);
    expect(book.no.bids[0]!.priceCents).toBeLessThan(book.no.asks[0]!.priceCents);
  });

  it("removes an order from the visible book at its expiration instant", () => {
    const expiresAt = "2026-10-31T20:00:00Z";
    const expiringOrder = order({
      outcome: "no",
      side: "buy",
      price_cents: 88,
      remaining_quantity: 8_333,
      expires_at: expiresAt,
    });

    expect(buildPredictionBook([expiringOrder], new Date("2026-10-31T19:59:59Z")).yes.asks).toEqual(
      [{ priceCents: 12, quantity: 8_333 }],
    );
    expect(buildPredictionBook([expiringOrder], new Date(expiresAt)).yes.asks).toEqual([]);
  });

  it("keeps one net position with an accurate cost through buys, sells, and paired fills", () => {
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
    const result = replayPredictionPosition({
      username: "trader",
      fills: [
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
      nettings: [{ id: 1, quantity: 3, created_at: "2026-10-27T00:00:07Z" }],
    });

    expect(result.positions).toEqual({
      yes: { quantity: 12, costCents: 420 },
      no: { quantity: 0, costCents: 0 },
    });
    expect(result.closed).toEqual({ costCents: 640, proceedsCents: 500, quantity: 16 });
  });

  it.each([false, true])(
    "holds only B after switching from A, with an explicit sell=%s",
    (sellFirst) => {
      const result = replayPredictionPosition({
        username: "trader",
        credits: [
          {
            outcome: "yes",
            quantity: 1000,
            price_cents: 20,
            fee_coins: 20,
            credited_at: "2026-11-01T00:00:00Z",
          },
        ],
        fills: [
          ...(sellFirst
            ? [
                {
                  id: 1,
                  taker_order_id: 1,
                  outcome: "yes" as const,
                  price_cents: 40,
                  quantity: 1000,
                  buyer_username: "other",
                  seller_username: "trader",
                  pair_key: null,
                  created_at: "2026-11-02T00:00:00Z",
                },
              ]
            : []),
          {
            id: 2,
            taker_order_id: 2,
            outcome: "no",
            price_cents: 60,
            quantity: 2000,
            buyer_username: "trader",
            seller_username: "maker",
            pair_key: null,
            created_at: "2026-11-03T00:00:00Z",
          },
        ],
        receipts: [
          { reason: "prediction_order_reserve", amount: -1224, metadata: { orderId: 2, fee: 24 } },
          ...(sellFirst
            ? [{ reason: "prediction_trade_credit", amount: 392, metadata: { orderId: 1, fee: 8 } }]
            : []),
        ],
        nettings: sellFirst ? [] : [{ id: 1, quantity: 1000, created_at: "2026-11-03T00:00:00Z" }],
      });
      expect(result.positions).toEqual({
        yes: { quantity: 0, costCents: 0 },
        no: { quantity: sellFirst ? 2000 : 1000, costCents: sellFirst ? 122400 : 61200 },
      });
      expect(result.closed.proceedsCents).toBe(sellFirst ? 39200 : 100000);
    },
  );

  it("keeps the remaining lot's cost when one order fills at multiple prices in the same transaction", () => {
    const time = "2026-11-03T00:00:00Z";
    const result = replayPredictionPosition({
      username: "trader",
      credits: [
        { outcome: "yes", quantity: 100, price_cents: 20, credited_at: "2026-11-01T00:00:00Z" },
      ],
      fills: [
        {
          id: 1,
          outcome: "no",
          price_cents: 40,
          quantity: 50,
          buyer_username: "trader",
          seller_username: null,
          pair_key: "first",
          created_at: time,
        },
        {
          id: 2,
          outcome: "no",
          price_cents: 60,
          quantity: 150,
          buyer_username: "trader",
          seller_username: null,
          pair_key: "second",
          created_at: time,
        },
      ],
      nettings: [
        { id: 1, quantity: 50, created_at: time },
        { id: 2, quantity: 50, created_at: time },
      ],
    });
    expect(result.positions).toEqual({
      yes: { quantity: 0, costCents: 0 },
      no: { quantity: 100, costCents: 6000 },
    });
    expect(result.closed).toEqual({ quantity: 200, costCents: 7000, proceedsCents: 10000 });
  });

  it("replays historical two-sided holdings before the netting feature without erasing shares that were later sold", () => {
    const result = replayPredictionPosition({
      username: "trader",
      credits: [
        { outcome: "yes", quantity: 100, price_cents: 20, credited_at: "2026-10-01T00:00:00Z" },
        { outcome: "no", quantity: 200, price_cents: 60, credited_at: "2026-10-01T00:00:00Z" },
      ],
      fills: [
        {
          id: 1,
          outcome: "yes",
          price_cents: 30,
          quantity: 100,
          buyer_username: "other",
          seller_username: "trader",
          pair_key: null,
          created_at: "2026-10-02T00:00:00Z",
        },
      ],
    });
    expect(result.positions.no).toEqual({ quantity: 200, costCents: 12000 });
    expect(result.positions.yes.quantity).toBe(0);
  });
});
