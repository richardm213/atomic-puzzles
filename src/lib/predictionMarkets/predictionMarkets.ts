import { z } from "zod";

import { postApi } from "../api/postApi";

export const NATSO_BAN_MARKET_ID = "natso-ban-2026";
export type PredictionOutcome = "yes" | "no";
export type PredictionOrderSide = "buy" | "sell";

const levelSchema = z.object({ priceCents: z.number(), quantity: z.number() });
const orderSchema = z
  .object({
    id: z.number(),
    username: z.string(),
    outcome: z.enum(["yes", "no"]),
    side: z.enum(["buy", "sell"]),
    price_cents: z.number(),
    quantity: z.number(),
    filled_quantity: z.number(),
    remaining_quantity: z.number(),
    status: z.enum(["open", "partial", "filled", "cancelled"]),
    created_at: z.string(),
    updated_at: z.string(),
  })
  .transform((order) => ({
    id: order.id,
    username: order.username,
    outcome: order.outcome,
    side: order.side,
    priceCents: order.price_cents,
    quantity: order.quantity,
    filledQuantity: order.filled_quantity,
    remainingQuantity: order.remaining_quantity,
    status: order.status,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  }));

const fillSchema = z
  .object({
    id: z.number(),
    outcome: z.enum(["yes", "no"]),
    price_cents: z.number(),
    quantity: z.number(),
    buyer_username: z.string(),
    seller_username: z.string().nullable(),
    created_at: z.string(),
  })
  .transform((fill) => ({
    id: fill.id,
    outcome: fill.outcome,
    priceCents: fill.price_cents,
    quantity: fill.quantity,
    buyerUsername: fill.buyer_username,
    sellerUsername: fill.seller_username,
    createdAt: fill.created_at,
  }));

const positionSchema = z
  .object({
    outcome: z.enum(["yes", "no"]),
    quantity: z.number(),
    reserved_quantity: z.number(),
    updated_at: z.string(),
  })
  .transform((position) => ({
    outcome: position.outcome,
    quantity: position.quantity,
    reservedQuantity: position.reserved_quantity,
    updatedAt: position.updated_at,
  }));

const marketStateSchema = z.object({
  result: z.object({
    market: z
      .object({
        id: z.string(),
        question: z.string(),
        resolution_rules: z.string(),
        resolution_source_url: z.string().url(),
        closes_at: z.string(),
        status: z.enum(["open", "closed", "resolved", "refunded"]),
        outcome: z.enum(["yes", "no"]).nullable(),
      })
      .transform((market) => ({
        id: market.id,
        question: market.question,
        resolutionRules: market.resolution_rules,
        resolutionSourceUrl: market.resolution_source_url,
        closesAt: market.closes_at,
        status: market.status,
        outcome: market.outcome,
      })),
    book: z.object({
      yes: z.object({ bids: z.array(levelSchema), asks: z.array(levelSchema) }),
      no: z.object({ bids: z.array(levelSchema), asks: z.array(levelSchema) }),
    }),
    fills: z.array(fillSchema),
    positions: z.array(positionSchema),
    orders: z.array(orderSchema),
  }),
});

export type PredictionMarketState = z.infer<typeof marketStateSchema>["result"];
export type PredictionOrder = PredictionMarketState["orders"][number];

const orderMutationSchema = z.object({
  result: z.object({ orderId: z.number(), balance: z.number() }),
});

export const fetchPredictionMarket = async (): Promise<PredictionMarketState> => {
  const response = await postApi(
    "/api/betting",
    { action: "exchangeMarket", marketId: NATSO_BAN_MARKET_ID },
    {
      schema: marketStateSchema,
      errorMessage: "Unable to load this market.",
      invalidMessage: "The market returned invalid order book data.",
    },
  );
  return response.result;
};

export const placePredictionOrder = async ({
  outcome,
  side,
  priceCents,
  quantity,
}: {
  outcome: PredictionOutcome;
  side: PredictionOrderSide;
  priceCents: number;
  quantity: number;
}) => {
  const response = await postApi(
    "/api/betting",
    {
      action: "placeExchangeOrder",
      marketId: NATSO_BAN_MARKET_ID,
      outcome,
      side,
      priceCents,
      quantity,
    },
    {
      schema: orderMutationSchema,
      errorMessage: "Unable to place this order.",
      invalidMessage: "The market returned invalid order details.",
    },
  );
  return response.result;
};

export const cancelPredictionOrder = async (orderId: number) => {
  const response = await postApi(
    "/api/betting",
    { action: "cancelExchangeOrder", marketId: NATSO_BAN_MARKET_ID, orderId },
    {
      schema: orderMutationSchema,
      errorMessage: "Unable to cancel this order.",
      invalidMessage: "The market returned invalid cancellation details.",
    },
  );
  return response.result;
};
