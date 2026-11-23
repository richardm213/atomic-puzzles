import { z } from "zod";

import {
  type PredictionBookLevel,
  type PredictionOrderSide,
  type PredictionOutcome,
} from "../../../shared/domain/betting";
import { formatPricePercentageValue } from "../../utils/formatters";
import { idempotentRequest } from "../api/idempotentRequest";
import { postApi } from "../api/postApi";

export type {
  PredictionBookLevel,
  PredictionOrderSide,
  PredictionOutcome,
} from "../../../shared/domain/betting";
export { MAX_PREDICTION_ORDER_QUANTITY, predictionOutcomes } from "../../../shared/domain/betting";

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
  display_order: z.number().nullable(),
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

export const isPendingPredictionOrder = (
  order: Pick<PredictionOrder, "status" | "remainingQuantity" | "expiresAt">,
): boolean =>
  (order.status === "open" || order.status === "partial") &&
  order.remainingQuantity > 0 &&
  (!order.expiresAt || Date.parse(order.expiresAt) > Date.now());

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
    isPendingPredictionOrder(order) &&
    displayedSide === bookSide &&
    predictionDisplayedOrderPrice(order, outcome) === priceCents
  );
};

export const predictionOutcomeLabel = (
  definition: PredictionMarketDefinition | undefined,
  outcome: PredictionOutcome,
): string => definition?.outcomeLabels?.[outcome] ?? (outcome === "yes" ? "Yes" : "No");

const marketPresentation: Record<
  string,
  {
    sportsbookLabels?: Record<PredictionOutcome, string>;
    matchupLabels?: Partial<Record<PredictionOutcome, string>>;
    clinchRule?: string;
    sortPriority: number;
  }
> = {
  "awc-2026-semifinal-jude-3-plus-points": {
    sportsbookLabels: {
      yes: "jude 3+ pts vs max",
      no: "jude less than 3 pts vs max",
    },
    sortPriority: 1,
  },
  "awc2026-lb-r3-m1-rechesster-6-0": {
    matchupLabels: { no: "quasabianth" },
    clinchRule: "Rechesster must clinch exactly 6–0.",
    sortPriority: 2,
  },
  "awc2026-lb-r3-m1-quasabianth-plus-2": {
    clinchRule:
      "Add 1.5 points to Quasabianth’s score. Quasa +1.5 wins if Quasabianth wins the match or loses by 1 point. Re -1.5 wins if Rechesster wins by 2 or more, such as 6–4.",
    sortPriority: 1,
  },
  "awc2026-lb-r3-m2-rabbier-plus-3": {
    clinchRule:
      "Add 1.5 points to Rabbier’s score. Rabbie +1.5 wins if Rabbier wins the match or loses by 1 point. Sut -1.5 wins if Sutcunuri wins by 2 or more, such as 6–4.",
    sortPriority: 1,
  },
};

export const predictionMarketMatchupLabel = (
  definition: PredictionMarketDefinition,
  outcome: PredictionOutcome,
): string =>
  marketPresentation[definition.id]?.matchupLabels?.[outcome] ??
  predictionOutcomeUnderscoreLabel(definition, outcome);

export const predictionMarketClinchNote = (marketId: PredictionMarketId): string | undefined => {
  const rule = marketPresentation[marketId]?.clinchRule;
  return rule
    ? `Only the score when the match is clinched counts. Games played afterward don’t count. ${rule}`
    : undefined;
};

export const predictionSportsbookOutcomeLabel = (
  definition: PredictionMarketDefinition | undefined,
  outcome: PredictionOutcome,
): string =>
  marketPresentation[definition?.id ?? ""]?.sportsbookLabels?.[outcome] ??
  predictionOutcomeLabel(definition, outcome);

export const comparePredictionMarketPriority = (
  left: PredictionMarketDefinition,
  right: PredictionMarketDefinition,
): number =>
  (marketPresentation[left.id]?.sortPriority ?? 0) -
  (marketPresentation[right.id]?.sortPriority ?? 0);

export const predictionOutcomeAbbreviation = (
  definition: PredictionMarketDefinition | undefined,
  outcome: PredictionOutcome,
): string => {
  const abbreviations: Record<string, string> = {
    natso: "natso",
    crepuscular: "crep",
    jakestatefarm: "jake",
    maracker: "mara",
    sutcunuri: "sut",
    howlind: "howlin",
    sircachetes: "sirca",
    quasabianth: "quasa",
    judebaetorrens: "jude",
    theatomicstorm: "storm",
    renaudmerle: "renaud",
    rechesster: "re",
    dandan2016: "dan",
    rabbier: "rabbie",
    maxwellssilvrhammer: "max",
  };
  return predictionOutcomeUnderscoreLabel(definition, outcome).replace(
    /^(\S+)(?=$| (?:[+-]\d+(?:\.\d+)?|\d+[-–]\d+)$)/,
    (name) => abbreviations[name.toLowerCase()] ?? name,
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

export const predictionBuyOrderCost = (
  quote: { fillCostCoins: number; restingQuantity: number },
  limitPriceCents: number,
): number =>
  quote.fillCostCoins +
  (quote.restingQuantity * limitPriceCents) / 100 +
  predictionTakerFee(quote.fillCostCoins);

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
    expires_at: z.string().nullable().optional(),
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
    ...(order.expires_at !== undefined ? { expiresAt: order.expires_at } : {}),
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

export const predictionHistoryPositionSchema = z
  .object({
    market_id: z.string(),
    username: z.string(),
    outcome: z.enum(["yes", "no"]),
    quantity: z.number().nonnegative(),
    reserved_quantity: z.number().nonnegative(),
    average_price_cents: z.number().nullable(),
    updated_at: z.string(),
    remaining_cost_coins: z.number().nonnegative().optional(),
    closed_cost_coins: z.number().nonnegative().optional(),
    closed_proceeds_coins: z.number().nonnegative().optional(),
    fees_coins: z.number().nonnegative().optional(),
    terminal_return_coins: z.number().optional(),
  })
  .transform((position) => ({
    marketId: position.market_id,
    username: position.username,
    outcome: position.outcome,
    quantity: position.quantity,
    reservedQuantity: position.reserved_quantity,
    averagePriceCents: position.average_price_cents,
    updatedAt: position.updated_at,
    ...(position.remaining_cost_coins === undefined
      ? {}
      : { remainingCost: position.remaining_cost_coins }),
    ...(position.terminal_return_coins === undefined
      ? {}
      : { terminalReturn: position.terminal_return_coins }),
    ...(position.closed_cost_coins === undefined
      ? {}
      : {
          closedCost: position.closed_cost_coins,
          closedProceeds: position.closed_proceeds_coins ?? 0,
          fees: position.fees_coins ?? 0,
        }),
  }));

export type PredictionHistoryPosition = z.infer<typeof predictionHistoryPositionSchema>;

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
    nextOrderExpiry: z.number().nullable().optional(),
    book: z.object({
      yes: z.object({ bids: z.array(levelSchema), asks: z.array(levelSchema) }),
      no: z.object({ bids: z.array(levelSchema), asks: z.array(levelSchema) }),
    }),
    fills: z.array(fillSchema),
    positions: z.array(positionSchema).max(1, "Expected one net position per market"),
    historyPositions: z.array(predictionHistoryPositionSchema).optional(),
    orders: z.array(orderSchema),
  }),
});

export const predictionMarketStateResultSchema = marketStateSchema.shape.result;

export type PredictionMarketState = z.infer<typeof marketStateSchema>["result"];
export type PredictionOrder = PredictionMarketState["orders"][number];
export type PredictionPosition = PredictionMarketState["positions"][number];

export const isPredictionPrice = (price: number): boolean =>
  Number.isInteger(price) && price >= 1 && price <= 99;

export const quotePredictionOrder = (
  book: PredictionMarketState["book"][PredictionOutcome] | undefined,
  side: PredictionOrderSide,
  price: number,
  quantity: number,
) => {
  if (side === "sell") {
    const sellQuote = quotePredictionSell(
      book?.bids ?? [],
      isPredictionPrice(price) ? price : 100,
      quantity,
    );
    const total = Math.max(
      0,
      sellQuote.proceedsCoins - predictionTakerFee(sellQuote.proceedsCoins),
    );
    return { total, profit: 0, action: "Ask", sellQuote };
  }

  const limit = isPredictionPrice(price) ? price : 0;
  const buyQuote = quotePredictionBuy(book?.asks ?? [], limit, quantity);
  const total = predictionBuyOrderCost(buyQuote, limit);
  return { total, profit: quantity - total, action: buyQuote.filledQuantity > 0 ? "Buy" : "Bid" };
};

export const availablePredictionContracts = (positions: readonly PredictionPosition[] = []) => {
  const available: Record<PredictionOutcome, number> = { yes: 0, no: 0 };
  for (const position of positions)
    available[position.outcome] += Math.max(0, position.quantity - position.reservedQuantity);
  return available;
};

type PredictionChanceState = {
  market: Pick<PredictionMarketState["market"], "status" | "settlementPriceCents" | "outcome">;
  fills?: PredictionMarketState["fills"];
};

export const predictionYesChance = (
  definition: PredictionMarketDefinition,
  state: PredictionChanceState | undefined,
): number | undefined => {
  if (state?.market.status === "resolved") {
    return state.market.settlementPriceCents ?? (state.market.outcome === "yes" ? 100 : 0);
  }
  const latestFill = state?.fills?.[0];
  if (!latestFill) return definition.startingChance;
  return latestFill.outcome === "yes" ? latestFill.priceCents : 100 - latestFill.priceCents;
};

export const sortPredictionMarketsByChance = (
  definitions: readonly PredictionMarketDefinition[],
  states: ReadonlyMap<PredictionMarketId, PredictionChanceState>,
): PredictionMarketDefinition[] =>
  definitions
    .map((definition, index) => ({
      chance: predictionYesChance(definition, states.get(definition.id)),
      definition,
      index,
      resolved: states.get(definition.id)?.market.status === "resolved",
    }))
    .sort((left, right) => {
      const priority = comparePredictionMarketPriority(left.definition, right.definition);
      if (priority) return priority;
      if (left.resolved !== right.resolved) return left.resolved ? 1 : -1;
      if (left.chance === undefined && right.chance === undefined) return left.index - right.index;
      if (left.chance === undefined) return 1;
      if (right.chance === undefined) return -1;
      return right.chance - left.chance || left.index - right.index;
    })
    .map(({ definition }) => definition);

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

export const formatPredictionChance = (value: number | undefined): string =>
  value === undefined ? "—" : `${formatPricePercentageValue(value)}%`;

export const formatPredictionAveragePrice = (
  cents: number | null | undefined,
): string | undefined => {
  if (cents === null || cents === undefined) return undefined;
  const price = cents.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${price}¢`;
};

const marketStatesSchema = z.object({ result: z.array(marketStateSchema.shape.result) });

export const fetchPredictionMarkets = async (
  marketIds: readonly PredictionMarketId[],
  signal?: AbortSignal,
): Promise<PredictionMarketState[]> => {
  const response = await postApi(
    "/api/betting",
    { action: "exchangeMarketBatch", marketIds },
    {
      schema: marketStatesSchema,
      errorMessage: "Unable to load prediction markets.",
      invalidMessage: "The markets returned invalid order book data.",
      ...(signal ? { signal } : {}),
    },
  );
  return response.result;
};

const orderMutationSchema = z.object({
  result: z.object({
    orderId: z.number(),
    balance: z.number(),
    marketId: z.string(),
    cancelledForInsufficientBalance: z.boolean().optional().default(false),
    state: marketStateSchema.shape.result,
  }),
});

export type PredictionOrderMutationResult = z.infer<typeof orderMutationSchema>["result"];

export const placePredictionOrder = async ({
  username,
  marketId,
  outcome,
  side,
  priceCents,
  quantity,
  budgetCoins,
}: {
  username: string;
  marketId: PredictionMarketId;
  outcome: PredictionOutcome;
  side: PredictionOrderSide;
  priceCents: number;
  quantity: number;
  budgetCoins?: number;
}) => {
  return idempotentRequest(
    `prediction-order:${username.toLowerCase()}:${JSON.stringify([marketId, outcome, side, ...(budgetCoins === undefined ? [priceCents, quantity] : ["budget", budgetCoins])])}`,
    { marketId, outcome, side, priceCents, quantity },
    async (requestId, original) => {
      const response = await postApi(
        "/api/betting",
        {
          action: "placeExchangeOrder",
          requestId,
          ...original,
        },
        {
          schema: orderMutationSchema,
          errorMessage: "Unable to place this order.",
          invalidMessage: "The market returned invalid order details.",
        },
      );
      return response.result;
    },
  );
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
