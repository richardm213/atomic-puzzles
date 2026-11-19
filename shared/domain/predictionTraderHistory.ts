import { z } from "zod";

import {
  isPredictionMarketRefund,
  type PredictionPositionCredit,
  type PredictionPositionFill,
  type PredictionPositionNetting,
  predictionTradingFee,
  replayPredictionPosition,
} from "./predictionAccounting";

export const predictionTraderHistorySchema = z.array(
  z.object({
    id: z.string(),
    createdAt: z.string(),
    action: z.enum(["buy", "sell", "fee", "settlement", "correction", "refund", "payment"]),
    outcome: z.enum(["yes", "no"]).nullable(),
    averagePriceCents: z.number().nullable(),
    quantity: z.number().nullable(),
    pnlChange: z.number(),
    runningPnl: z.number(),
  }),
);
export type PredictionTraderHistoryEntry = z.infer<typeof predictionTraderHistorySchema>[number];
export type PredictionHistoryReceipt = {
  id: number;
  amount: number;
  reason: string;
  source_key: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
type Entry = Omit<PredictionTraderHistoryEntry, "runningPnl">;
const numeric = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const roundCoins = (amount: number): number => Math.round(amount * 1e6) / 1e6;

// Trades share the holdings replay. Cash receipts supply fees, actual
// settlements and corrections, so the final running total also explains historical repairs.
export const buildPredictionTraderHistory = ({
  username,
  fills,
  credits,
  nettings,
  receipts,
  market,
}: {
  username: string;
  fills: readonly PredictionPositionFill[];
  credits: readonly PredictionPositionCredit[];
  nettings: readonly PredictionPositionNetting[];
  receipts: readonly PredictionHistoryReceipt[];
  market: {
    status: string;
    resolved_at: string | null;
    outcome: string | null;
    settlement_price_cents: number | null;
  };
}): PredictionTraderHistoryEntry[] => {
  const rows: Entry[] = [];
  const hasTrades = fills.length > 0 || credits.length > 0;
  const replay = replayPredictionPosition({
    username,
    fills,
    credits,
    nettings: hasTrades ? nettings : [],
    receipts,
    onTransaction: (row) => rows.push(row),
  });
  const remainingOutcome = replay.positions.yes.quantity > 0 ? "yes" : "no";
  const remainingQuantity = replay.positions.yes.quantity + replay.positions.no.quantity;
  const remainingCost = (replay.positions.yes.costCents + replay.positions.no.costCents) / 100;
  let settled = false;
  for (const receipt of [...receipts].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
  )) {
    const metadata = receipt.metadata ?? {};
    const outcome =
      metadata.outcome === "yes" || metadata.outcome === "no" ? metadata.outcome : null;
    const row: Entry = {
      id: `receipt:${receipt.id}`,
      createdAt: receipt.created_at,
      action: "refund",
      outcome,
      averagePriceCents: numeric(metadata.priceCents),
      quantity: numeric(metadata.quantity),
      pnlChange: receipt.amount,
    };
    if (receipt.reason === "prediction_trade_fee") {
      if (hasTrades) continue; // Already included in the matched trade's average price.
      row.action = "fee";
      row.pnlChange = -predictionTradingFee(receipt);
    } else if (receipt.reason === "prediction_reconciliation") row.action = "correction";
    else if (receipt.reason === "prediction_market_payout" || isPredictionMarketRefund(receipt)) {
      row.action = receipt.reason === "prediction_market_payout" ? "settlement" : "refund";
      row.quantity = numeric(metadata.contracts) ?? remainingQuantity;
      row.averagePriceCents = row.quantity > 0 ? (receipt.amount * 100) / row.quantity : null;
      row.outcome ??= remainingOutcome;
      if (!settled) row.pnlChange -= remainingCost;
      settled = true;
    } else if (
      !hasTrades &&
      ["prediction_order_reserve", "prediction_order_refund", "prediction_trade_credit"].includes(
        receipt.reason,
      )
    ) {
      // Old resets deleted their fills. Their surviving receipts explain the refund
      // and correction without inventing a trade or replaying orphaned nettings.
      row.action = receipt.amount < 0 ? "payment" : "refund";
    } else continue;
    rows.push(row);
  }
  if (market.status === "resolved" && !settled && remainingQuantity > 0) {
    const yesPrice = market.settlement_price_cents ?? (market.outcome === "yes" ? 100 : 0);
    const price = remainingOutcome === "yes" ? yesPrice : 100 - yesPrice;
    // A losing settlement has no coin receipt. Do not invent a positive payout if
    // a settlement receipt is missing: that discrepancy belongs in the cash audit.
    if (price === 0)
      rows.push({
        id: "settlement:zero",
        createdAt: market.resolved_at ?? replay.updatedAt,
        action: "settlement",
        outcome: remainingOutcome,
        averagePriceCents: 0,
        quantity: remainingQuantity,
        pnlChange: -remainingCost,
      });
  }
  const grouped: Entry[] = [];
  for (const row of rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const previous = grouped.at(-1);
    if (
      (row.action === "buy" || row.action === "sell") &&
      previous?.action === row.action &&
      previous.createdAt === row.createdAt &&
      previous.outcome === row.outcome &&
      previous.quantity !== null &&
      row.quantity !== null &&
      previous.averagePriceCents !== null &&
      row.averagePriceCents !== null
    ) {
      const quantity = previous.quantity + row.quantity;
      previous.averagePriceCents =
        (previous.averagePriceCents * previous.quantity + row.averagePriceCents * row.quantity) /
        quantity;
      previous.quantity = quantity;
      previous.pnlChange += row.pnlChange;
    } else grouped.push({ ...row });
  }
  let runningPnl = 0;
  return grouped.map((row) => {
    const pnlChange = roundCoins(row.pnlChange);
    runningPnl = roundCoins(runningPnl + pnlChange);
    return { ...row, pnlChange, runningPnl };
  });
};
