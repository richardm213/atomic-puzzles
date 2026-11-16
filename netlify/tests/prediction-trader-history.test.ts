import { describe, expect, it } from "vitest";

import type { PredictionPositionFill } from "../../shared/domain/predictionAccounting";
import {
  buildPredictionTraderHistory,
  type PredictionHistoryReceipt,
} from "../../shared/domain/predictionTraderHistory";

const time = (day: number) => `2026-11-${String(day).padStart(2, "0")}T00:00:00Z`;
const fill = (
  id: number,
  quantity: number,
  price_cents: number,
  extra: Partial<PredictionPositionFill> = {},
): PredictionPositionFill => ({
  id,
  quantity,
  price_cents,
  outcome: "yes",
  buyer_username: "trader",
  seller_username: "other",
  pair_key: null,
  taker_order_id: id,
  created_at: time(id),
  ...extra,
});
const receipt = (
  id: number,
  amount: number,
  reason: string,
  extra: Partial<PredictionHistoryReceipt> = {},
): PredictionHistoryReceipt => ({
  id,
  amount,
  reason,
  source_key: `receipt:${id}`,
  metadata: {},
  created_at: time(id),
  ...extra,
});
const market = {
  status: "resolved",
  resolved_at: time(5),
  outcome: "yes",
  settlement_price_cents: null,
};

describe("prediction trader transactions", () => {
  it("averages same-transaction fills and carries realized gains and fees through a partial sale and settlement", () => {
    const rows = buildPredictionTraderHistory({
      username: "trader",
      credits: [],
      nettings: [],
      market,
      fills: [
        fill(1, 100, 20),
        fill(2, 100, 40, { created_at: time(1), taker_order_id: 1 }),
        fill(3, 50, 50, {
          created_at: time(2),
          buyer_username: "other",
          seller_username: "trader",
        }),
      ],
      receipts: [
        receipt(3, -1, "prediction_trade_fee", { metadata: { orderId: 1 } }),
        receipt(5, 150, "prediction_market_payout", {
          metadata: { outcome: "yes", contracts: 150 },
        }),
      ],
    });
    expect(
      rows.map(({ action, quantity, averagePriceCents, pnlChange, runningPnl }) => ({
        action,
        quantity,
        averagePriceCents,
        pnlChange,
        runningPnl,
      })),
    ).toEqual([
      { action: "buy", quantity: 200, averagePriceCents: 30.5, pnlChange: 0, runningPnl: 0 },
      { action: "sell", quantity: 50, averagePriceCents: 50, pnlChange: 9.75, runningPnl: 9.75 },
      {
        action: "settlement",
        quantity: 150,
        averagePriceCents: 100,
        pnlChange: 104.25,
        runningPnl: 114,
      },
    ]);
  });

  it("counts imported purchase fees once when closing the opposite side", () => {
    const rows = buildPredictionTraderHistory({
      username: "trader",
      market: { ...market, outcome: "no" },
      credits: [
        {
          outcome: "no",
          quantity: 300,
          price_cents: 60,
          credited_at: time(2),
          fee_coins: 3.6,
          cost_coins: 183.6,
        },
      ],
      fills: [fill(3, 200, 30)],
      nettings: [{ id: 1, quantity: 200, created_at: time(3) }],
      receipts: [
        receipt(10, -183.6, "prediction_order_reserve", {
          created_at: time(1),
          metadata: { fee: 3.6, positionCreditId: 7 },
        }),
        receipt(3, 200, "prediction_trade_credit", { source_key: "prediction-position-net:1" }),
        receipt(4, -5, "prediction_trade_fee", { metadata: { orderId: 3 } }),
        receipt(5, 100, "prediction_market_payout", {
          metadata: { outcome: "no", contracts: 100 },
        }),
      ],
    });
    expect(rows.filter((row) => row.action === "sell")).toMatchObject([
      { outcome: "no", quantity: 200, averagePriceCents: 67.5, pnlChange: 12.6 },
    ]);
    expect(rows.at(-1)).toMatchObject({ action: "settlement", pnlChange: 38.8, runningPnl: 51.4 });
  });

  it("closes the existing side before buying any excess, with all-in prices and no extra trading action", () => {
    for (const quantity of [4, 10, 15]) {
      const rows = buildPredictionTraderHistory({
        username: "trader",
        market: { ...market, status: "open", resolved_at: null, outcome: null },
        credits: [],
        fills: [fill(1, 10, 40), fill(2, quantity, 70, { outcome: "no" })],
        nettings: [{ id: 1, quantity: Math.min(10, quantity), created_at: time(2) }],
        receipts: [
          receipt(1, -0.08, "prediction_trade_fee", { metadata: { orderId: 1 } }),
          receipt(2, -quantity * 0.014, "prediction_trade_fee", { metadata: { orderId: 2 } }),
        ],
      });
      const sale = rows.find((row) => row.action === "sell")!;
      expect(sale).toMatchObject({ outcome: "yes", quantity: Math.min(10, quantity) });
      expect(sale.averagePriceCents).toBeCloseTo(28.6);
      expect(rows.at(-1)!.runningPnl).toBeCloseTo(Math.min(10, quantity) * -0.122);
      const remaining = rows.reduce(
        (held, row) => {
          held[row.outcome!] += row.quantity! * (row.action === "sell" ? -1 : 1);
          return held;
        },
        { yes: 0, no: 0 },
      );
      expect(remaining).toEqual({
        yes: Math.max(0, 10 - quantity),
        no: Math.max(0, quantity - 10),
      });
      expect(rows.every((row) => row.action === "buy" || row.action === "sell")).toBe(true);
    }
  });

  it("settles the remaining losing side even when the last buy was the opposite side", () => {
    const rows = buildPredictionTraderHistory({
      username: "trader",
      credits: [],
      nettings: [{ id: 1, quantity: 3, created_at: time(2) }],
      market: { ...market, outcome: "no" },
      fills: [fill(1, 10, 40), fill(2, 3, 70, { outcome: "no" })],
      receipts: [receipt(3, -0.08, "prediction_trade_fee", { metadata: { orderId: 1 } })],
    });
    expect(rows.at(-1)).toMatchObject({
      action: "settlement",
      outcome: "yes",
      quantity: 7,
      averagePriceCents: 0,
      runningPnl: -3.18,
    });
  });

  it("uses surviving cash receipts for deleted reset trades and ignores orphaned redemption records", () => {
    const rows = buildPredictionTraderHistory({
      username: "trader",
      credits: [],
      fills: [],
      market: { ...market, status: "open", resolved_at: null, outcome: null },
      nettings: [{ id: 1, quantity: 10, created_at: time(1) }],
      receipts: [
        receipt(1, -9.18, "prediction_order_reserve", { metadata: { fee: 0.18 } }),
        receipt(3, 9, "prediction_order_refund"),
      ],
    });
    expect(rows.map((row) => row.action)).toEqual(["payment", "refund"]);
    expect(rows.at(-1)?.runningPnl).toBe(-0.18);
  });
  it("shows imported-position refunds once and keeps realized netting profit", () => {
    const credits = [
      {
        outcome: "yes" as const,
        quantity: 20,
        price_cents: 40,
        cost_coins: 8.16,
        fee_coins: 0.16,
        credited_at: time(1),
      },
      {
        outcome: "no" as const,
        quantity: 10,
        price_cents: 30,
        cost_coins: 3.06,
        fee_coins: 0.06,
        credited_at: time(2),
      },
    ];
    for (const returned of [4.08, 3.08]) {
      const rows = buildPredictionTraderHistory({
        username: "trader",
        market: { ...market, status: "refunded", outcome: null },
        credits,
        fills: [],
        nettings: [{ id: 1, quantity: 10, created_at: time(3) }],
        receipts: [
          receipt(1, returned, "prediction_order_refund", {
            created_at: time(5),
            source_key: "prediction-market-refund:market:trader",
            metadata: { kind: "market-refund" },
          }),
        ],
      });
      expect(rows.filter((row) => row.action === "refund")).toMatchObject([
        { quantity: 10, pnlChange: returned - 4.08 },
      ]);
      expect(rows.at(-1)?.runningPnl).toBeCloseTo(2.86 + returned - 4.08);
    }
  });
});
