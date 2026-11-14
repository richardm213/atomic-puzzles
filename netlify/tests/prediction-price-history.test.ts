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
    points: [{ time: end - 1000, open: 40, high: 55, low: 40, close: 50, quantity: 17 }],
  });
  const all = buildPredictionPriceHistory(fills, end, "all", settlement);
  expect(all.start).toBe(end - 2 * 3_600_000);
  expect(all.points.reduce((sum, point) => sum + point.quantity, 0)).toBe(24);
});
