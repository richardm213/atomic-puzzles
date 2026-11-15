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
  predictionOutcome?: PredictionOutcome;
  predictionSelectionLabel?: string | undefined;
  predictionSelectionCountryCode?: string | undefined;
  predictionMarketTitle?: string | undefined;
  realizedPnl?: number;
  mixedPredictionOutcomes?: boolean;
};

// One history entry per bettor and strike, including trades on both outcomes.
export const predictionStrikeBetsByBettor = (
  bets: readonly BetHistoryEntry[],
  { realizedOnly = false }: { realizedOnly?: boolean } = {},
): BetHistoryEntry[] => {
  const grouped = new Map<string, BetHistoryEntry>();
  for (const bet of bets) {
    const key = `${bet.marketId}:${bet.username.toLowerCase()}`;
    const payout =
      realizedOnly && bet.status === "open" ? bet.totalCost + (bet.realizedPnl ?? 0) : bet.payout;
    const previous = grouped.get(key);
    if (!previous) {
      grouped.set(key, {
        ...bet,
        status: realizedOnly ? "settled" : bet.status,
        payout,
        historyKey: `prediction-position:${key}`,
      });
      continue;
    }
    previous.mixedPredictionOutcomes =
      previous.mixedPredictionOutcomes || previous.predictionOutcome !== bet.predictionOutcome;
    previous.stake += bet.stake;
    previous.fee += bet.fee;
    previous.totalCost += bet.totalCost;
    previous.payout += payout;
    previous.potentialPayout += bet.potentialPayout;
    previous.realizedPnl = (previous.realizedPnl ?? 0) + (bet.realizedPnl ?? 0);
    previous.status = realizedOnly
      ? "settled"
      : previous.status === "open" || bet.status === "open"
        ? "open"
        : previous.status === bet.status
          ? previous.status
          : "settled";
    previous.settledAt = previous.status === "open" ? null : (previous.settledAt ?? bet.settledAt);
    if (Date.parse(bet.placedAt) > Date.parse(previous.placedAt)) previous.placedAt = bet.placedAt;
  }
  return [...grouped.values()].sort((left, right) => right.totalCost - left.totalCost);
};

export const predictionPnlByMarketId = (
  bets: readonly BetHistoryEntry[],
): ReadonlyMap<string, number> => {
  const pnlByMarketId = new Map<string, number>();
  for (const bet of bets) {
    if (bet.kind !== "prediction") continue;
    const pnl = bet.status === "open" ? (bet.realizedPnl ?? 0) : bet.payout - bet.totalCost;
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
}: {
  tournamentBets: TournamentBet[];
  predictionPositions: PredictionHistoryPosition[];
  predictionMarketGroups: PredictionMarketGroup[];
  predictionMarketStates: PredictionMarketState[];
  minimumPositionCost?: number;
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
    const totalCost = roundCoins(remainingCost + closedCost + fees);
    if (totalCost < minimumPositionCost && closedCost === 0 && fees === 0) return [];
    const settlement = predictionSettlement(
      state,
      position.outcome,
      position.quantity,
      remainingCost,
    );
    if (position.quantity === 0) settlement.status = "settled";
    const hasNamedOutcomes = Boolean(definition.outcomeLabels);
    return [
      {
        id: 0,
        marketId: definition.id,
        username: position.username,
        selection: definition.username,
        priceCents: Math.round(position.averagePriceCents),
        stake: roundCoins(remainingCost + closedCost),
        fee: fees,
        totalCost,
        potentialPayout: position.quantity + closedProceeds,
        ...settlement,
        payout: settlement.payout + closedProceeds,
        realizedPnl: roundCoins(closedProceeds - closedCost - fees),
        placedAt: position.updatedAt,
        kind: "prediction",
        historyKey: `prediction-position:${position.marketId}:${position.username.toLowerCase()}:${position.outcome}`,
        predictionOutcome: position.outcome,
        predictionSelectionLabel: hasNamedOutcomes
          ? predictionOutcomeLabel(definition, position.outcome)
          : undefined,
        predictionSelectionCountryCode: predictionOutcomeCountryCode(definition, position.outcome),
        predictionMarketTitle: title,
      },
    ];
  });

  return [...standardBets, ...predictionStrikeBetsByBettor(predictionBets)].sort(
    (left, right) => Date.parse(right.placedAt) - Date.parse(left.placedAt),
  );
};
