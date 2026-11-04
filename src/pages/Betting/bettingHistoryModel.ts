import { AWC_NOT_TO_WIN_MARKET_ID, type TournamentBet } from "../../lib/betting/betting";
import {
  type PredictionHistoryPosition,
  type PredictionMarketGroup,
  type PredictionMarketState,
  type PredictionOutcome,
  predictionOutcomeCountryCode,
  predictionOutcomeLabel,
} from "../../lib/predictionMarkets/predictionMarkets";

export type BetHistoryEntry = TournamentBet & {
  kind?: "prediction";
  historyKey?: string;
  predictionUsername?: string;
  predictionOutcome?: PredictionOutcome;
  predictionSelectionLabel?: string | undefined;
  predictionSelectionCountryCode?: string | undefined;
  predictionMarketTitle?: string | undefined;
  predictionSettlementPriceCents?: number | undefined;
};

const predictionSettlement = (
  state: PredictionMarketState | undefined,
  outcome: PredictionOutcome,
  quantity: number,
  totalCost: number,
): Pick<TournamentBet, "status" | "payout" | "settledAt"> => {
  const resolvedOutcome = state?.market.outcome;
  const settlementPrice = state?.market.settlementPriceCents;
  const status: TournamentBet["status"] =
    state?.market.status === "refunded"
      ? "refunded"
      : state?.market.status === "resolved"
        ? settlementPrice !== null && settlementPrice !== undefined
          ? "settled"
          : resolvedOutcome === outcome
            ? "won"
            : "lost"
        : "open";
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
  const predictionMarkets = predictionMarketGroups.flatMap((group) => group.markets);
  const stateByMarketId = new Map(predictionMarketStates.map((state) => [state.market.id, state]));
  const roundOf16MarketById = new Map(
    (
      predictionMarketGroups.find((group) => group.id === "awc-2026-round-of-16")?.markets ?? []
    ).map((market) => [market.id, market]),
  );

  const standardBets = tournamentBets.filter(
    (bet) =>
      !roundOf16MarketById.has(bet.marketId) &&
      bet.marketId !== "awc2026-winner" &&
      bet.marketId !== AWC_NOT_TO_WIN_MARKET_ID,
  );

  const predictionMarketById = new Map(predictionMarkets.map((market) => [market.id, market]));
  const predictionBets = predictionPositions.flatMap((position): BetHistoryEntry[] => {
    const definition = predictionMarketById.get(position.marketId);
    if (!definition) return [];
    const state = stateByMarketId.get(position.marketId);
    const group = predictionMarketGroups.find((candidate) =>
      candidate.markets.some((market) => market.id === position.marketId),
    );
    const averagePriceCents = position.averagePriceCents ?? 0;
    const totalCost = Math.round(averagePriceCents * position.quantity * 10_000) / 1_000_000;
    const hasNamedOutcomes = Boolean(definition.outcomeLabels);
    return [
      {
        id: 0,
        marketId: definition.id,
        username: position.username,
        selection: definition.username,
        priceCents: Math.round(averagePriceCents),
        stake: totalCost,
        fee: 0,
        totalCost,
        potentialPayout: position.quantity,
        ...predictionSettlement(state, position.outcome, position.quantity, totalCost),
        placedAt: position.updatedAt,
        kind: "prediction",
        historyKey: `prediction-position:${position.marketId}:${position.username}:${position.outcome}`,
        predictionUsername: definition.username,
        predictionOutcome: position.outcome,
        predictionSelectionLabel: hasNamedOutcomes
          ? predictionOutcomeLabel(definition, position.outcome)
          : undefined,
        predictionSelectionCountryCode: predictionOutcomeCountryCode(definition, position.outcome),
        predictionMarketTitle:
          group?.id === "awc-2026-champion" ? "Who will win 2026 AWC" : group?.title,
        predictionSettlementPriceCents: state?.market.settlementPriceCents ?? undefined,
      },
    ];
  });

  return [...standardBets, ...predictionBets].sort(
    (left, right) => Date.parse(right.placedAt) - Date.parse(left.placedAt),
  );
};
