import { AWC_NOT_TO_WIN_MARKET_ID, type TournamentBet } from "../../lib/betting/betting";
import {
  type PredictionHistoryPosition,
  type PredictionMarketDefinition,
  type PredictionMarketGroup,
  type PredictionMarketState,
  type PredictionOutcome,
  predictionOutcomeCountryCode,
  predictionOutcomeLabel,
} from "../../lib/predictionMarkets/predictionMarkets";

export type BetHistoryEntry = TournamentBet & {
  kind?: "prediction";
  historyKey?: string;
  predictionOutcome?: PredictionOutcome | undefined;
  predictionSelectionLabel?: string | undefined;
  predictionSelectionCountryCode?: string | undefined;
  predictionMarketTitle?: string | undefined;
  realizedPnl?: number;
  pnl?: number;
};

export const betHistoryReturn = (bet: BetHistoryEntry): number =>
  bet.status === "open" ? bet.potentialPayout : bet.payout;
export const betHistoryPnl = (bet: BetHistoryEntry): number =>
  bet.pnl ?? betHistoryReturn(bet) - bet.totalCost;

export const predictionPnlByMarketId = (
  bets: readonly BetHistoryEntry[],
): ReadonlyMap<string, number> => {
  const pnlByMarketId = new Map<string, number>();
  for (const bet of bets) {
    if (bet.kind !== "prediction") continue;
    const pnl = bet.status === "open" ? (bet.realizedPnl ?? 0) : betHistoryPnl(bet);
    if (bet.status === "open" && pnl === 0) continue;
    pnlByMarketId.set(bet.marketId, (pnlByMarketId.get(bet.marketId) ?? 0) + pnl);
  }
  for (const [marketId, pnl] of pnlByMarketId) {
    pnlByMarketId.set(marketId, Math.abs(pnl) < 0.005 ? 0 : pnl);
  }
  return pnlByMarketId;
};

const replacedTournamentMarketIds = new Set(["awc2026-winner", AWC_NOT_TO_WIN_MARKET_ID]);

const roundCoins = (value: number) => Math.round(value * 10_000) / 10_000;

const predictionSettlement = (
  state: PredictionMarketState | undefined,
  outcome: PredictionOutcome,
  quantity: number,
  totalCost: number,
): Pick<TournamentBet, "status" | "payout" | "settledAt"> => {
  const resolvedOutcome = state?.market.outcome;
  const settlementPrice = state?.market.settlementPriceCents;
  let status: TournamentBet["status"] = "open";
  if (state?.market.status === "refunded") status = "refunded";
  if (state?.market.status === "resolved") {
    status =
      settlementPrice === null || settlementPrice === undefined
        ? resolvedOutcome === outcome
          ? "won"
          : "lost"
        : "settled";
  }
  const settlementPayout =
    settlementPrice !== null && settlementPrice !== undefined
      ? (quantity * (outcome === "yes" ? settlementPrice : 100 - settlementPrice)) / 100
      : 0;
  return {
    status,
    payout:
      status === "won"
        ? quantity
        : status === "settled"
          ? settlementPayout
          : status === "refunded"
            ? totalCost
            : 0,
    settledAt: status === "open" ? null : (state?.market.resolvedAt ?? null),
  };
};

export const buildBetHistory = ({
  tournamentBets,
  predictionPositions,
  predictionMarketGroups,
  predictionMarketStates,
  minimumPositionCost = 1,
  realizedOnly = false,
}: {
  tournamentBets: TournamentBet[];
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

  const standardBets = tournamentBets.filter(
    (bet) =>
      !predictionMarketById.has(bet.marketId) && !replacedTournamentMarketIds.has(bet.marketId),
  );

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
        id: 0,
        marketId: definition.id,
        username: position.username,
        selection: definition.username,
        priceCents: position.averagePriceCents,
        stake: remainingCost,
        fee: fees,
        totalCost: remainingCost,
        potentialPayout: position.quantity + closedProceeds,
        ...settlement,
        ...(realizedOnly ? { status: "settled" as const } : {}),
        payout: settlement.payout + closedProceeds,
        realizedPnl,
        pnl,
        placedAt: position.updatedAt,
        kind: "prediction",
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

  return [...standardBets, ...predictionBets].sort(
    (left, right) => Date.parse(right.placedAt) - Date.parse(left.placedAt),
  );
};
