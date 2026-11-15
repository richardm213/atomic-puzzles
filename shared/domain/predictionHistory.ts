import { z } from "zod";

export const predictionHistoryPeriodSchema = z.enum(["1h", "3h", "12h", "1d", "all"]);
export type PredictionHistoryPeriod = z.infer<typeof predictionHistoryPeriodSchema>;
export const predictionHistoryDuration: Record<PredictionHistoryPeriod, number | null> = {
  "1h": 3_600_000,
  "3h": 10_800_000,
  "12h": 43_200_000,
  "1d": 86_400_000,
  all: null,
};
export const predictionPriceHistorySchema = z.object({
  start: z.number(),
  end: z.number(),
  points: z.array(
    z.object({
      time: z.number(),
      open: z.number(),
      high: z.number(),
      low: z.number(),
      close: z.number(),
      price: z.number(),
      quantity: z.number(),
    }),
  ),
  settlement: z.object({ time: z.number(), price: z.number() }).nullable(),
});
export type PredictionPriceHistory = z.infer<typeof predictionPriceHistorySchema>;

export const buildPredictionPriceHistory = (
  fills: readonly {
    id: number;
    outcome: "yes" | "no";
    price_cents: number;
    quantity: number;
    pair_key: string | null;
    created_at: string;
  }[],
  end: number,
  period: PredictionHistoryPeriod,
  settlement: PredictionPriceHistory["settlement"],
): PredictionPriceHistory => {
  const ordered = [...fills]
    .filter((fill) => !(fill.pair_key && fill.outcome === "no"))
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const duration = predictionHistoryDuration[period];
  const start = duration
    ? end - duration
    : Math.min(Date.parse(ordered[0]?.created_at ?? "") || end, end - 1);
  const bucketSize = Math.max(1, Math.ceil((end - start) / 120));
  const buckets = new Map<
    number,
    {
      point: PredictionPriceHistory["points"][number];
      volumeAtPrice: Map<number, number>;
    }
  >();
  for (const fill of ordered) {
    const time = Date.parse(fill.created_at);
    if (!Number.isFinite(time) || time < start || time > end) continue;
    const key = Math.min(119, Math.floor((time - start) / bucketSize));
    const price = fill.outcome === "yes" ? fill.price_cents : 100 - fill.price_cents;
    const bucket = buckets.get(key) ?? {
      point: { time, open: price, high: price, low: price, close: price, price, quantity: 0 },
      volumeAtPrice: new Map<number, number>(),
    };
    const { point, volumeAtPrice } = bucket;
    point.high = Math.max(point.high, price);
    point.low = Math.min(point.low, price);
    point.close = price;
    point.quantity += fill.quantity;
    const volume = (volumeAtPrice.get(price) ?? 0) + fill.quantity;
    volumeAtPrice.set(price, volume);
    // Use the most recent trade to break ties in cumulative contract volume.
    if (volume >= (volumeAtPrice.get(point.price) ?? 0)) point.price = price;
    buckets.set(key, bucket);
  }
  return { start, end, points: [...buckets.values()].map(({ point }) => point), settlement };
};
