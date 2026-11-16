import { describe, expect, it } from "vitest";

import { describeBettingTransaction } from "../features/coins/transactionDescriptions";

const market = {
  id: "match",
  display_name: "rabbier vs natso",
  outcome_yes_label: "rabbier",
  outcome_no_label: "natso",
};
const context = {
  markets: new Map([[market.id, market]]),
  orders: new Map([[1, { id: 1, outcome: "no", filled_quantity: 12 }]]),
  fills: new Map([[2, { id: 2, outcome: "yes", quantity: 7 }]]),
  legacyMarkets: new Map(),
};

describe("coin transaction activities", () => {
  it("resolves the traded selection and actual shares without confusing fees or proceeds with quantity", () => {
    expect(
      describeBettingTransaction(
        {
          reason: "prediction_order_reserve",
          amount: -8.568,
          metadata: { marketId: "match", orderId: 1, chargeMode: "fill", quantity: 12, fee: 0.168 },
        },
        context,
      ),
    ).toBe("Bought 12 shares of natso");
    expect(
      describeBettingTransaction(
        {
          reason: "prediction_trade_credit",
          amount: 4.802,
          metadata: { marketId: "match", fillId: 2 },
        },
        context,
      ),
    ).toBe("Sold 7 shares of rabbier");
  });

  it("distinguishes an old prepaid order's executed shares from unfilled reservations", () => {
    const transaction = {
      reason: "prediction_order_reserve",
      amount: -70,
      metadata: { marketId: "match", orderId: 1, quantity: 100 },
    };
    expect(describeBettingTransaction(transaction, context)).toBe("Bought 12 shares of natso");
    expect(
      describeBettingTransaction(transaction, {
        ...context,
        orders: new Map([[1, { id: 1, outcome: "no", filled_quantity: 0 }]]),
      }),
    ).toBe("Reserved coins for 100 shares of natso");
  });

  it("names payout matchups and keeps No shares explicit for player-winner markets", () => {
    expect(
      describeBettingTransaction(
        {
          reason: "prediction_market_payout",
          amount: 12,
          metadata: { marketId: "match", outcome: "no", contracts: 12 },
        },
        context,
      ),
    ).toBe("Payout for rabbier vs natso");
    const winner = {
      ...market,
      display_name: "rabbier",
      outcome_yes_label: null,
      outcome_no_label: null,
    };
    expect(
      describeBettingTransaction(
        {
          reason: "prediction_order_reserve",
          amount: -1.02,
          metadata: { marketId: "match", orderId: 1, quantity: 12, chargeMode: "fill" },
        },
        { ...context, markets: new Map([[winner.id, winner]]) },
      ),
    ).toBe("Bought 12 No shares of rabbier");
  });
});
