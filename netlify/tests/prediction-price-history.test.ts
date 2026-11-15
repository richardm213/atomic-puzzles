import { expect, it } from "vitest";

import { buildPredictionPriceHistory } from "../../shared/domain/predictionHistory";

it("normalizes complementary prices and aggregates trade volume once within resolution-relative ranges", () => {
  const end = Date.parse("2026-11-14T12:00:00Z");
  const fill = (
    id: number,
    time: number,
    price: number,
    quantity: number,
    outcome: "yes" | "no" = "yes",
    pair: string | null = null,
  ) => ({
    id,
    created_at: new Date(time).toISOString(),
    price_cents: price,
    quantity,
    outcome,
    pair_key: pair,
  });
  const fills = [
    fill(1, end - 2 * 3_600_000, 20, 7),
    fill(2, end - 1000, 40, 10, "yes", "pair"),
    fill(3, end - 1000, 60, 10, "no", "pair"),
    fill(4, end - 500, 45, 5, "no"),
    fill(5, end, 50, 2),
    fill(6, end + 1000, 90, 100),
  ];
  const settlement = { time: end, price: 100 };
  const hour = buildPredictionPriceHistory(fills, end, "1h", settlement);
  expect(hour).toEqual({
    start: end - 3_600_000,
    end,
    settlement,
    points: [{ time: end - 1000, open: 40, high: 55, low: 40, close: 50, price: 40, quantity: 17 }],
  });
  const all = buildPredictionPriceHistory(fills, end, "all", settlement);
  expect(all.start).toBe(end - 2 * 3_600_000);
  expect(all.points.reduce((sum, point) => sum + point.quantity, 0)).toBe(24);
});

it("selects cumulative volume leaders independently per interval and breaks ties by the most recent trade", () => {
  const end = Date.parse("2026-11-14T12:00:00Z");
  const trades = [
    [-59_000, 40, 7],
    [-58_000, 60, 10],
    [-57_000, 40, 6],
    [-56_000, 75, 1],
    [-55_000, 75, 1],
    [-54_000, 75, 1],
    [-29_000, 20, 8],
    [-28_000, 30, 8],
    [-27_000, 20, 1],
    [-26_000, 30, 1],
    [-25_000, 50, 1],
  ] as const;
  const fills = trades
    .map(([offset, price, quantity], index) => ({
      id: index + 1,
      created_at: new Date(end + offset).toISOString(),
      outcome: "yes" as const,
      price_cents: price,
      quantity,
      pair_key: null,
    }))
    .reverse();
  const history = buildPredictionPriceHistory(fills, end, "1h", null);
  expect(history.points).toEqual([
    expect.objectContaining({ price: 40, close: 75, quantity: 26 }),
    expect.objectContaining({ price: 30, close: 50, quantity: 19 }),
  ]);
});
