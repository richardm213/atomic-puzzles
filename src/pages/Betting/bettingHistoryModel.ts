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
}: {
  tournamentBets: TournamentBet[];
  predictionPositions: PredictionHistoryPosition[];
  predictionMarketGroups: PredictionMarketGroup[];
  predictionMarketStates: PredictionMarketState[];
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
    const totalCost = roundCoins((position.averagePriceCents * position.quantity) / 100);
    if (totalCost < 1) return [];
    const hasNamedOutcomes = Boolean(definition.outcomeLabels);
    return [
      {
        id: 0,
        marketId: definition.id,
        username: position.username,
        selection: definition.username,
        priceCents: Math.round(position.averagePriceCents),
        stake: totalCost,
        fee: 0,
        totalCost,
        potentialPayout: position.quantity,
        ...predictionSettlement(state, position.outcome, position.quantity, totalCost),
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

  return [...standardBets, ...predictionBets].sort(
    (left, right) => Date.parse(right.placedAt) - Date.parse(left.placedAt),
  );
};
