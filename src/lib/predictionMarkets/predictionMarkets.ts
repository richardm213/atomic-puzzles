import { z } from "zod";

import { postApi } from "../api/postApi";

export const NATSO_BAN_MARKET_ID = "natso-ban-2026";
export const NEW_LIFE14_BAN_MARKET_ID = "new-life14-ban-2026";
export const GOROARMET_BAN_MARKET_ID = "goroarmet-ban-2026";
export const PREDICTION_BAN_MARKETS = [
  { id: NATSO_BAN_MARKET_ID, username: "Natso", countryCode: "NL", startingChance: undefined },
  {
    id: NEW_LIFE14_BAN_MARKET_ID,
    username: "New_Life14",
    countryCode: "KZ",
    startingChance: undefined,
  },
  {
    id: GOROARMET_BAN_MARKET_ID,
    username: "GoroArmeT",
    countryCode: "ES",
    startingChance: undefined,
  },
] as const;
export const PREDICTION_ATOMIC_SHIELD_MARKETS = [
  {
    id: "november-atomic-shield-2026-rechesster",
    username: "rechesster",
    countryCode: "AT",
    startingChance: undefined,
  },
  {
    id: "november-atomic-shield-2026-vannto",
    username: "vannto",
    countryCode: "VE",
    startingChance: undefined,
  },
  {
    id: "november-atomic-shield-2026-wolfram-ep",
    username: "wolfram_ep",
    countryCode: "RU",
    startingChance: undefined,
  },
  {
    id: "november-atomic-shield-2026-opabinia",
    username: "opabinia",
    countryCode: "US",
    startingChance: undefined,
  },
  {
    id: "november-atomic-shield-2026-maxwellssilvrhammer",
    username: "maxwellssilvrhammer",
    countryCode: "US",
    startingChance: undefined,
  },
  {
    id: "november-atomic-shield-2026-new-life14",
    username: "new_life14",
    countryCode: "KZ",
    startingChance: undefined,
  },
  {
    id: "november-atomic-shield-2026-others",
    username: "others",
    countryCode: "",
    startingChance: undefined,
  },
] as const;

export const PREDICTION_AWC_CHAMPION_MARKETS = [
  { id: "awc-2026-champion-natso", username: "natso", countryCode: "NL", startingChance: 30 },
  {
    id: "awc-2026-champion-maxwellssilvrhammer",
    username: "maxwellssilvrhammer",
    countryCode: "US",
    startingChance: 23,
  },
  {
    id: "awc-2026-champion-sutcunuri",
    username: "sutcunuri",
    countryCode: "TR",
    startingChance: 20,
  },
  {
    id: "awc-2026-champion-rechesster",
    username: "rechesster",
    countryCode: "AT",
    startingChance: 20,
  },
  {
    id: "awc-2026-champion-jakestatefarm",
    username: "jakestatefarm",
    countryCode: "US",
    startingChance: 15,
  },
  {
    id: "awc-2026-champion-quasabianth",
    username: "quasabianth",
    countryCode: "RU",
    startingChance: 5,
  },
  {
    id: "awc-2026-champion-maracker",
    username: "maracker",
    countryCode: "RU",
    startingChance: 4,
  },
  {
    id: "awc-2026-champion-judebaetorrens",
    username: "judebaetorrens",
    countryCode: "US",
    startingChance: 2,
  },
  {
    id: "awc-2026-champion-howlind",
    username: "howlind",
    countryCode: "FR",
    startingChance: 1,
  },
  {
    id: "awc-2026-champion-renaudmerle",
    username: "renaudmerle",
    countryCode: "FR",
    startingChance: 1,
  },
  {
    id: "awc-2026-champion-rabbier",
    username: "rabbier",
    countryCode: "NZ",
    startingChance: 1,
  },
  {
    id: "awc-2026-champion-theatomicstorm",
    username: "theatomicstorm",
    countryCode: "US",
    startingChance: 1,
  },
  {
    id: "awc-2026-champion-dandan2016",
    username: "dandan2016",
    countryCode: "US",
    startingChance: 1,
  },
  {
    id: "awc-2026-champion-tolya-starina0995",
    username: "tolya_starina0995",
    countryCode: "RU",
    startingChance: 1,
  },
  {
    id: "awc-2026-champion-stinkypotato",
    username: "stinkypotato",
    countryCode: "US",
    startingChance: 0,
  },
  {
    id: "awc-2026-champion-goroarmet",
    username: "goroarmet",
    countryCode: "ES",
    startingChance: 0,
  },
  {
    id: "awc-2026-champion-arinor0109",
    username: "arinor0109",
    countryCode: "SE",
    startingChance: 0,
  },
  {
    id: "awc-2026-champion-matvei-e2e4",
    username: "matvei-e2e4",
    countryCode: "RU",
    startingChance: 0,
  },
] as const;

export const PREDICTION_MARKET_GROUPS = [
  {
    id: "ban-2026",
    path: "/betting/ban-2026",
    title: "Who will be banned by Dec 31?",
    description: "Trade Lichess ban prediction markets with Atomic Coins.",
    markets: PREDICTION_BAN_MARKETS,
  },
  {
    id: "november-atomic-shield-2026",
    path: "/betting/november-atomic-shield-2026",
    title: "Who will win the November Atomic Shield?",
    description: "Trade November Atomic Shield winner predictions with Atomic Coins.",
    markets: PREDICTION_ATOMIC_SHIELD_MARKETS,
  },
  {
    id: "awc-2026-champion",
    path: "/betting/awc-2026-champion",
    title: "Who will be the 2026 Atomic World Champion?",
    description: "Trade 2026 Atomic World Championship winner predictions with Atomic Coins.",
    markets: PREDICTION_AWC_CHAMPION_MARKETS,
  },
] as const;

export const PREDICTION_MARKETS = [
  ...PREDICTION_BAN_MARKETS,
  ...PREDICTION_ATOMIC_SHIELD_MARKETS,
  ...PREDICTION_AWC_CHAMPION_MARKETS,
] as const;

export type PredictionMarketId = (typeof PREDICTION_MARKETS)[number]["id"];
export type PredictionMarketDefinition = (typeof PREDICTION_MARKETS)[number];
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
    average_price_cents: z.number().nullable(),
    updated_at: z.string(),
  })
  .transform((position) => ({
    outcome: position.outcome,
    quantity: position.quantity,
    reservedQuantity: position.reserved_quantity,
    averagePriceCents: position.average_price_cents,
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

export const fetchPredictionMarket = async (
  marketId: PredictionMarketId,
): Promise<PredictionMarketState> => {
  const response = await postApi(
    "/api/betting",
    { action: "exchangeMarket", marketId },
    {
      schema: marketStateSchema,
      errorMessage: "Unable to load this market.",
      invalidMessage: "The market returned invalid order book data.",
    },
  );
  return response.result;
};

export const placePredictionOrder = async ({
  marketId,
  outcome,
  side,
  priceCents,
  quantity,
}: {
  marketId: PredictionMarketId;
  outcome: PredictionOutcome;
  side: PredictionOrderSide;
  priceCents: number;
  quantity: number;
}) => {
  const response = await postApi(
    "/api/betting",
    {
      action: "placeExchangeOrder",
      marketId,
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

export const cancelPredictionOrder = async (marketId: PredictionMarketId, orderId: number) => {
  const response = await postApi(
    "/api/betting",
    { action: "cancelExchangeOrder", marketId, orderId },
    {
      schema: orderMutationSchema,
      errorMessage: "Unable to cancel this order.",
      invalidMessage: "The market returned invalid cancellation details.",
    },
  );
  return response.result;
};
