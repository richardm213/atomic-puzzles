import { z } from "zod";

import {
  type PredictionBookLevel,
  type PredictionOrderSide,
  type PredictionOutcome,
} from "../../../shared/domain/betting";
import { postApi } from "../api/postApi";

export type {
  PredictionBookLevel,
  PredictionOrderSide,
  PredictionOutcome,
} from "../../../shared/domain/betting";
export { predictionOutcomes } from "../../../shared/domain/betting";

export type PredictionMarketId = string;
export type PredictionMarketDefinition = {
  id: PredictionMarketId;
  username: string;
  countryCode: string;
  startingChance?: number | undefined;
  outcomeLabels?: Record<PredictionOutcome, string> | undefined;
  outcomeCountryCodes?: Record<PredictionOutcome, string> | undefined;
};
export type PredictionMarketGroup = {
  id: string;
  path: string;
  title: string;
  description: string;
  displayOrder: number;
  markets: PredictionMarketDefinition[];
};

export const predictionMarketCatalogRowSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  group_path: z.string(),
  group_title: z.string(),
  group_description: z.string(),
  group_order: z.number(),
  display_name: z.string(),
  country_code: z.string(),
  starting_chance: z.number().nullable(),
  display_order: z.number(),
  outcome_yes_label: z.string().nullable(),
  outcome_no_label: z.string().nullable(),
  outcome_yes_country_code: z.string().nullable(),
  outcome_no_country_code: z.string().nullable(),
});

const catalogSchema = z.object({
  result: z.array(predictionMarketCatalogRowSchema),
});

type PredictionMarketCatalogRow = z.infer<typeof predictionMarketCatalogRowSchema>;

export const predictionMarketGroupsFromRows = (
  rows: PredictionMarketCatalogRow[],
): PredictionMarketGroup[] => {
  const groups = new Map<string, PredictionMarketGroup>();
  for (const row of rows) {
    const group = groups.get(row.group_id) ?? {
      id: row.group_id,
      path: row.group_path,
      title: row.group_title,
      description: row.group_description,
      displayOrder: row.group_order,
      markets: [],
    };
    const hasNamedOutcomes = Boolean(row.outcome_yes_label && row.outcome_no_label);
    group.markets.push({
      id: row.id,
      username: row.display_name.toLowerCase(),
      countryCode: row.country_code,
      startingChance: row.starting_chance ?? undefined,
      outcomeLabels: hasNamedOutcomes
        ? { yes: row.outcome_yes_label ?? "Yes", no: row.outcome_no_label ?? "No" }
        : undefined,
      outcomeCountryCodes: hasNamedOutcomes
        ? {
            yes: row.outcome_yes_country_code ?? row.country_code,
            no: row.outcome_no_country_code ?? row.country_code,
          }
        : undefined,
    });
    groups.set(row.group_id, group);
  }
  return [...groups.values()].sort((a, b) => a.displayOrder - b.displayOrder);
};

export const fetchPredictionMarketGroups = async (): Promise<PredictionMarketGroup[]> => {
  const response = await postApi(
    "/api/betting",
    { action: "exchangeMarkets" },
    {
      schema: catalogSchema,
      errorMessage: "Unable to load prediction markets.",
      invalidMessage: "The prediction market catalog is invalid.",
    },
  );
  return predictionMarketGroupsFromRows(response.result);
};

export const PREDICTION_TAKER_FEE_RATE = 0.02;

export const predictionDisplayedOrderPrice = (
  order: PredictionOrder,
  outcome: PredictionOutcome,
): number => (order.outcome === outcome ? order.priceCents : 100 - order.priceCents);

export const predictionOrderAppearsAtLevel = (
  order: PredictionOrder,
  outcome: PredictionOutcome,
  bookSide: "bid" | "ask",
  priceCents: number,
): boolean => {
  const displayedSide =
    order.outcome === outcome
      ? order.side === "buy"
        ? "bid"
        : "ask"
      : order.side === "buy"
        ? "ask"
        : "bid";

  return (
    order.remainingQuantity > 0 &&
    (order.status === "open" || order.status === "partial") &&
    displayedSide === bookSide &&
    predictionDisplayedOrderPrice(order, outcome) === priceCents
  );
};

export const predictionOutcomeLabel = (
  definition: PredictionMarketDefinition | undefined,
  outcome: PredictionOutcome,
): string => definition?.outcomeLabels?.[outcome] ?? (outcome === "yes" ? "Yes" : "No");

export const predictionOutcomeAbbreviation = (
  definition: PredictionMarketDefinition | undefined,
  outcome: PredictionOutcome,
): string => {
  const label = predictionOutcomeLabel(definition, outcome);
  const abbreviations: Record<string, string> = {
    natso: "natso",
    crepuscular: "crep",
    jakestatefarm: "jake",
    maracker: "mara",
    sutcunuri: "sut",
    howlind: "howlin",
    quasabianth: "quasa",
    judebaetorrens: "jude",
    theatomicstorm: "storm",
    renaudmerle: "renaud",
    rechesster: "rechess",
    dandan2016: "dandan",
    rabbier: "rabbie",
  };
  return (
    abbreviations[label.toLowerCase()] ?? predictionOutcomeUnderscoreLabel(definition, outcome)
  );
};

export const predictionOutcomeUnderscoreLabel = (
  definition: PredictionMarketDefinition | undefined,
  outcome: PredictionOutcome,
): string => {
  const label = predictionOutcomeLabel(definition, outcome);
  const underscoreIndex = label.indexOf("_");
  return underscoreIndex > 0 ? label.slice(0, underscoreIndex) : label;
};

export const predictionOutcomeCountryCode = (
  definition: PredictionMarketDefinition | undefined,
  outcome: PredictionOutcome,
): string => definition?.outcomeCountryCodes?.[outcome] ?? definition?.countryCode ?? "";

export const predictionTakerFee = (executedValueCoins: number) =>
  Math.round(executedValueCoins * PREDICTION_TAKER_FEE_RATE * 1_000_000) / 1_000_000;

const quotePredictionLevels = (
  levels: readonly PredictionBookLevel[],
  quantity: number,
  isExecutable: (priceCents: number) => boolean,
) => {
  let remaining = Math.max(0, quantity);
  let filledQuantity = 0;
  let executedValueCents = 0;

  for (const level of levels) {
    if (!isExecutable(level.priceCents) || remaining === 0) break;
    const levelFill = Math.min(remaining, level.quantity);
    filledQuantity += levelFill;
    executedValueCents += levelFill * level.priceCents;
    remaining -= levelFill;
  }

  return {
    availableQuantity: levels
      .filter((level) => isExecutable(level.priceCents))
      .reduce((total, level) => total + level.quantity, 0),
    filledQuantity,
    restingQuantity: remaining,
    executedValueCoins: executedValueCents / 100,
    averageFillPriceCents: filledQuantity > 0 ? executedValueCents / filledQuantity : undefined,
  };
};

export const quotePredictionBuy = (
  asks: readonly PredictionBookLevel[],
  limitPriceCents: number,
  quantity: number,
) => {
  const quote = quotePredictionLevels(
    asks,
    quantity,
    (priceCents) => priceCents <= limitPriceCents,
  );
  const { executedValueCoins, ...details } = quote;
  return { ...details, fillCostCoins: executedValueCoins };
};

export const quotePredictionSell = (
  bids: readonly PredictionBookLevel[],
  limitPriceCents: number,
  quantity: number,
) => {
  const quote = quotePredictionLevels(
    bids,
    quantity,
    (priceCents) => priceCents >= limitPriceCents,
  );
  const { executedValueCoins, ...details } = quote;
  return { ...details, proceedsCoins: executedValueCoins };
};

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
        resolution_source_url: z
          .string()
          .url()
          .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
            message: "Resolution source must use HTTP or HTTPS.",
          }),
        closes_at: z.string(),
        status: z.enum(["open", "closed", "resolved", "refunded"]),
        outcome: z.enum(["yes", "no"]).nullable(),
        settlement_price_cents: z.number().int().min(0).max(100).nullable(),
        settlement_reference_fill_id: z.number().int().nullable(),
        resolved_at: z.string().nullable(),
        sportsbook_volume_coins: z.number().default(0),
        exchange_volume_coins: z.number().default(0),
      })
      .transform((market) => ({
        id: market.id,
        question: market.question,
        resolutionRules: market.resolution_rules,
        resolutionSourceUrl: market.resolution_source_url,
        closesAt: market.closes_at,
        status: market.status,
        outcome: market.outcome,
        settlementPriceCents: market.settlement_price_cents,
        settlementReferenceFillId: market.settlement_reference_fill_id,
        resolvedAt: market.resolved_at,
        sportsbookVolumeCoins: market.sportsbook_volume_coins,
        exchangeVolumeCoins: market.exchange_volume_coins,
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

export const predictionMarketStateResultSchema = marketStateSchema.shape.result;

export type PredictionMarketState = z.infer<typeof marketStateSchema>["result"];
export type PredictionOrder = PredictionMarketState["orders"][number];

export const predictionYesChance = (
  definition: PredictionMarketDefinition,
  state: PredictionMarketState | undefined,
): number | undefined => {
  if (state?.market.status === "resolved") {
    return state.market.settlementPriceCents ?? (state.market.outcome === "yes" ? 100 : 0);
  }
  const latestFill = state?.fills[0];
  if (!latestFill) return definition.startingChance;
  return latestFill.outcome === "yes" ? latestFill.priceCents : 100 - latestFill.priceCents;
};

export const suggestedPredictionPrice = (
  definition: PredictionMarketDefinition,
  state: PredictionMarketState | undefined,
  outcome: PredictionOutcome,
): number =>
  state?.book[outcome].asks[0]?.priceCents ??
  (outcome === "yes"
    ? definition.startingChance
    : definition.startingChance === undefined
      ? undefined
      : 100 - definition.startingChance) ??
  50;

export const predictionMarketVolume = (state: PredictionMarketState | undefined): number =>
  (state?.market.sportsbookVolumeCoins ?? 0) + (state?.market.exchangeVolumeCoins ?? 0);

export const formatPredictionShares = (value: number): string =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

const marketStatesSchema = z.object({ result: z.array(marketStateSchema.shape.result) });

export const fetchPredictionMarkets = async (
  marketIds: readonly PredictionMarketId[],
): Promise<PredictionMarketState[]> => {
  const response = await postApi(
    "/api/betting",
    { action: "exchangeMarketBatch", marketIds },
    {
      schema: marketStatesSchema,
      errorMessage: "Unable to load prediction markets.",
      invalidMessage: "The markets returned invalid order book data.",
    },
  );
  return response.result;
};

const orderMutationSchema = z.object({
  result: z.object({
    orderId: z.number(),
    balance: z.number(),
    marketId: z.string(),
    state: marketStateSchema.shape.result,
  }),
});

export type PredictionOrderMutationResult = z.infer<typeof orderMutationSchema>["result"];

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

export const amendPredictionOrder = async ({
  marketId,
  orderId,
  priceCents,
  quantity,
}: {
  marketId: PredictionMarketId;
  orderId: number;
  priceCents: number;
  quantity: number;
}) => {
  const response = await postApi(
    "/api/betting",
    { action: "amendExchangeOrder", marketId, orderId, priceCents, quantity },
    {
      schema: orderMutationSchema,
      errorMessage: "Unable to update this order.",
      invalidMessage: "The market returned invalid order details.",
    },
  );
  return response.result;
};
