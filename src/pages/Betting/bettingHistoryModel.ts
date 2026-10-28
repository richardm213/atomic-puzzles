import { AWC_NOT_TO_WIN_MARKET_ID, type TournamentBet } from "../../lib/betting/betting";
import {
  type PredictionMarketGroup,
  type PredictionMarketState,
  type PredictionOutcome,
  predictionOutcomeLabel,
  predictionOutcomes,
} from "../../lib/predictionMarkets/predictionMarkets";

export type BetHistoryEntry = TournamentBet & {
  kind?: "prediction";
  historyKey?: string;
  predictionUsername?: string;
  predictionOutcome?: PredictionOutcome;
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
  predictionMarketGroups,
  predictionMarketStates,
}: {
  tournamentBets: TournamentBet[];
  predictionMarketGroups: PredictionMarketGroup[];
  predictionMarketStates: PredictionMarketState[];
}): BetHistoryEntry[] => {
  const predictionMarkets = predictionMarketGroups.flatMap((group) => group.markets);
  const stateByMarketId = new Map(predictionMarketStates.map((state) => [state.market.id, state]));
  const championMarketByUsername = new Map(
    (predictionMarketGroups.find((group) => group.id === "awc-2026-champion")?.markets ?? []).map(
      (market) => [market.username.toLowerCase(), market],
    ),
  );
  const roundOf16MarketById = new Map(
    (
      predictionMarketGroups.find((group) => group.id === "awc-2026-round-of-16")?.markets ?? []
    ).map((market) => [market.id, market]),
  );

  const normalizedTournamentBets = tournamentBets.map((bet): BetHistoryEntry => {
    const roundOf16Definition = roundOf16MarketById.get(bet.marketId);
    if (roundOf16Definition) {
      const outcome = predictionOutcomes.find(
        (entry) =>
          predictionOutcomeLabel(roundOf16Definition, entry).toLowerCase() ===
          bet.selection.toLowerCase(),
      );
      if (!outcome) return bet;
      return {
        ...bet,
        ...predictionSettlement(
          stateByMarketId.get(roundOf16Definition.id),
          outcome,
          bet.potentialPayout,
          bet.totalCost,
        ),
        marketId: roundOf16Definition.id,
        selection: predictionOutcomeLabel(roundOf16Definition, outcome),
        kind: "prediction",
        predictionUsername: roundOf16Definition.username,
        predictionOutcome: outcome,
        predictionMarketTitle: "AWC 2026 Round of 16",
      };
    }

    const isChampionNo = bet.marketId === AWC_NOT_TO_WIN_MARKET_ID;
    if (bet.marketId !== "awc2026-winner" && !isChampionNo) return bet;
    const definition = championMarketByUsername.get(bet.selection.toLowerCase());
    if (!definition) return bet;
    const outcome: PredictionOutcome = isChampionNo ? "no" : "yes";
    return {
      ...bet,
      ...predictionSettlement(
        stateByMarketId.get(definition.id),
        outcome,
        bet.potentialPayout,
        bet.totalCost,
      ),
      marketId: definition.id,
      selection: definition.username,
      kind: "prediction",
      predictionUsername: definition.username,
      predictionOutcome: outcome,
      predictionMarketTitle: "AWC 2026 champion",
    };
  });

  const predictionBets = predictionMarkets.flatMap((definition) => {
    const state = stateByMarketId.get(definition.id);
    const group = predictionMarketGroups.find((candidate) =>
      candidate.markets.some((market) => market.id === definition.id),
    );
    return (state?.fills ?? [])
      .filter((fill) => fill.buyerUsername.toLowerCase() !== "prediction_admin")
      .map((fill): BetHistoryEntry => {
        const totalCost = Math.round(fill.priceCents * fill.quantity * 10_000) / 1_000_000;
        return {
          id: fill.id,
          marketId: definition.id,
          username: fill.buyerUsername,
          selection: definition.username,
          priceCents: fill.priceCents,
          stake: totalCost,
          fee: 0,
          totalCost,
          potentialPayout: fill.quantity,
          ...predictionSettlement(state, fill.outcome, fill.quantity, totalCost),
          placedAt: fill.createdAt,
          kind: "prediction",
          predictionUsername: definition.username,
          predictionOutcome: fill.outcome,
          predictionMarketTitle:
            group?.id === "awc-2026-champion" ? "AWC 2026 champion" : group?.title,
          predictionSettlementPriceCents: state?.market.settlementPriceCents ?? undefined,
        };
      });
  });

  const combined = new Map<string, BetHistoryEntry>();
  const standardBets: BetHistoryEntry[] = [];
  for (const bet of [...normalizedTournamentBets, ...predictionBets]) {
    if (bet.kind !== "prediction") {
      standardBets.push(bet);
      continue;
    }
    const key = [bet.username.toLowerCase(), bet.marketId, bet.predictionOutcome, bet.status].join(
      ":",
    );
    const current = combined.get(key);
    const potentialPayout = (current?.potentialPayout ?? 0) + bet.potentialPayout;
    const stake = (current?.stake ?? 0) + bet.stake;
    combined.set(key, {
      ...(current ?? bet),
      id: current?.id ?? bet.id,
      historyKey: `prediction:${key}`,
      priceCents: potentialPayout > 0 ? Math.round((stake / potentialPayout) * 100) : 0,
      stake,
      fee: (current?.fee ?? 0) + bet.fee,
      totalCost: (current?.totalCost ?? 0) + bet.totalCost,
      potentialPayout,
      payout: (current?.payout ?? 0) + bet.payout,
      placedAt:
        !current || Date.parse(bet.placedAt) > Date.parse(current.placedAt)
          ? bet.placedAt
          : current.placedAt,
      settledAt: bet.settledAt ?? current?.settledAt ?? null,
    });
  }

  return [...standardBets, ...combined.values()].sort(
    (left, right) => Date.parse(right.placedAt) - Date.parse(left.placedAt),
  );
};
