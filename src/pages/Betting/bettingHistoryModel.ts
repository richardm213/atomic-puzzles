import {
  type PredictionHistoryPosition,
  type PredictionMarketDefinition,
  type PredictionMarketGroup,
  type PredictionMarketState,
  type PredictionOutcome,
  predictionOutcomeCountryCode,
  predictionOutcomeLabel,
} from "../../lib/predictionMarkets/predictionMarkets";

export type BetHistoryEntry = {
  marketId: string;
  username: string;
  selection: string;
  priceCents: number;
  totalCost: number;
  potentialPayout: number;
  status: "open" | "won" | "lost" | "refunded" | "settled";
  payout: number;
  placedAt: string;
  historyKey: string;
  predictionOutcome: PredictionOutcome;
  predictionSelectionLabel?: string | undefined;
  predictionSelectionCountryCode?: string | undefined;
  predictionMarketTitle?: string | undefined;
  realizedPnl: number;
  pnl: number;
};

export const betHistoryReturn = (bet: BetHistoryEntry): number =>
  bet.status === "open" ? bet.potentialPayout : bet.payout;

export const predictionPnlByMarketId = (
  bets: readonly BetHistoryEntry[],
): ReadonlyMap<string, number> => {
  const pnlByMarketId = new Map<string, number>();
  for (const bet of bets) {
    const pnl = bet.status === "open" ? bet.realizedPnl : bet.pnl;
    if (bet.status === "open" && pnl === 0) continue;
    pnlByMarketId.set(bet.marketId, (pnlByMarketId.get(bet.marketId) ?? 0) + pnl);
  }
  for (const [marketId, pnl] of pnlByMarketId) {
    pnlByMarketId.set(marketId, Math.abs(pnl) < 0.005 ? 0 : pnl);
  }
  return pnlByMarketId;
};

const roundCoins = (value: number) => Math.round(value * 10_000) / 10_000;

const predictionSettlement = (
  state: PredictionMarketState | undefined,
  outcome: PredictionOutcome,
  quantity: number,
  totalCost: number,
): Pick<BetHistoryEntry, "status" | "payout"> => {
  const market = state?.market;
  if (market?.status === "refunded") return { status: "refunded", payout: totalCost };
  if (market?.status !== "resolved") return { status: "open", payout: 0 };
  const price = market.settlementPriceCents;
  const payoutPrice =
    price !== null && price !== undefined
      ? outcome === "yes"
        ? price
        : 100 - price
      : market.outcome === outcome
        ? 100
        : 0;
  return {
    status:
      price !== null && price !== undefined ? "settled" : payoutPrice === 100 ? "won" : "lost",
    payout: (quantity * payoutPrice) / 100,
  };
};

export const buildBetHistory = ({
  predictionPositions,
  predictionMarketGroups,
  predictionMarketStates,
  minimumPositionCost = 1,
  realizedOnly = false,
}: {
  predictionPositions: PredictionHistoryPosition[];
  predictionMarketGroups: PredictionMarketGroup[];
  predictionMarketStates: PredictionMarketState[];
  minimumPositionCost?: number;
  realizedOnly?: boolean;
}): BetHistoryEntry[] => {
  const stateByMarketId = new Map(predictionMarketStates.map((state) => [state.market.id, state]));
  const predictionMarketById = new Map<
    string,
    { definition: PredictionMarketDefinition; title: string }
  >();
  for (const group of predictionMarketGroups) {
    const title = group.id === "awc-2026-champion" ? "Who will win 2026 AWC" : group.title;
    for (const definition of group.markets) {
      predictionMarketById.set(definition.id, { definition, title });
    }
  }

  const predictionBets = predictionPositions.flatMap((position): BetHistoryEntry[] => {
    const predictionMarket = predictionMarketById.get(position.marketId);
    if (!predictionMarket || position.averagePriceCents === null) return [];
    const { definition, title } = predictionMarket;
    const state = stateByMarketId.get(position.marketId);
    const remainingCost = roundCoins((position.averagePriceCents * position.quantity) / 100);
    const closedCost = position.closedCost ?? 0;
    const closedProceeds = position.closedProceeds ?? 0;
    const fees = position.fees ?? 0;
    if (remainingCost < minimumPositionCost && closedCost === 0 && fees === 0) return [];
    const settlement = predictionSettlement(
      state,
      position.outcome,
      position.quantity,
      remainingCost,
    );
    if (position.quantity === 0) settlement.status = "settled";
    const realizedPnl = roundCoins(closedProceeds - closedCost - fees);
    const isResolved = state?.market.status === "resolved" || state?.market.status === "refunded";
    const pnl = roundCoins(
      realizedPnl +
        (isResolved
          ? settlement.payout - remainingCost
          : realizedOnly
            ? 0
            : position.quantity - remainingCost),
    );
    const hasNamedOutcomes = Boolean(definition.outcomeLabels);
    return [
      {
        marketId: definition.id,
        username: position.username,
        selection: definition.username,
        priceCents: position.averagePriceCents,
        totalCost: remainingCost,
        potentialPayout: position.quantity + closedProceeds,
        ...settlement,
        ...(realizedOnly ? { status: "settled" as const } : {}),
        payout: settlement.payout + closedProceeds,
        realizedPnl,
        pnl,
        placedAt: position.updatedAt,
        historyKey: `prediction-position:${position.marketId}:${position.username.toLowerCase()}`,
        predictionOutcome: position.outcome,
        predictionSelectionLabel: hasNamedOutcomes
          ? predictionOutcomeLabel(definition, position.outcome)
          : undefined,
        predictionSelectionCountryCode: predictionOutcomeCountryCode(definition, position.outcome),
        predictionMarketTitle: title,
      },
    ];
  });

  return predictionBets.sort(
    (left, right) => Date.parse(right.placedAt) - Date.parse(left.placedAt),
  );
};
