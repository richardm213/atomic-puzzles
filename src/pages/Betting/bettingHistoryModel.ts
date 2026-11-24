import { awcBettingRoundTitle } from "../../../shared/domain/betting";
import type { BettingMarketSummary } from "../../lib/betting/betting";
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

const roundCoins = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

const predictionSettlement = (
  market: BettingMarketSummary | undefined,
  outcome: PredictionOutcome,
  quantity: number,
  totalCost: number,
): Pick<BetHistoryEntry, "status" | "payout"> => {
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
  predictionMarketStates = [],
  marketSummaries = [],
  realizedOnly = false,
}: {
  predictionPositions: PredictionHistoryPosition[];
  predictionMarketGroups: PredictionMarketGroup[];
  predictionMarketStates?: PredictionMarketState[];
  marketSummaries?: BettingMarketSummary[];
  realizedOnly?: boolean;
}): BetHistoryEntry[] => {
  const marketById = new Map(marketSummaries.map((market) => [market.id, market]));
  for (const { market } of predictionMarketStates) marketById.set(market.id, market);
  const predictionMarketById = new Map<
    string,
    { definition: PredictionMarketDefinition; title: string }
  >();
  for (const group of predictionMarketGroups) {
    const title =
      group.id === "awc-2026-champion"
        ? "Who will win 2026 AWC"
        : (awcBettingRoundTitle(group.id) ?? group.title);
    for (const definition of group.markets) {
      predictionMarketById.set(definition.id, { definition, title });
    }
  }

  const predictionBets = predictionPositions.flatMap((position): BetHistoryEntry[] => {
    const predictionMarket = predictionMarketById.get(position.marketId);
    if (!predictionMarket || position.averagePriceCents === null) return [];
    const { definition, title } = predictionMarket;
    const remainingCost = roundCoins(
      position.remainingCost ?? (position.averagePriceCents * position.quantity) / 100,
    );
    const closedCost = position.closedCost ?? 0;
    const closedProceeds = position.closedProceeds ?? 0;
    const fees = position.fees ?? 0;
    const hasRemainingShares = position.quantity > 0;
    if (
      !hasRemainingShares &&
      closedCost === 0 &&
      closedProceeds === 0 &&
      fees === 0 &&
      !position.terminalReturn
    )
      return [];
    const settlement = predictionSettlement(
      marketById.get(position.marketId),
      position.outcome,
      position.quantity,
      remainingCost,
    );
    const realizedPnl = roundCoins(closedProceeds - closedCost - fees);
    const isResolved = settlement.status !== "open";
    const terminalReturn = isResolved ? (position.terminalReturn ?? settlement.payout) : 0;
    const payout = hasRemainingShares ? terminalReturn : closedProceeds + terminalReturn;
    const pnl = roundCoins(
      !isResolved && hasRemainingShares && !realizedOnly
        ? position.quantity - remainingCost
        : realizedPnl + (isResolved ? terminalReturn - remainingCost : 0),
    );
    const hasNamedOutcomes = Boolean(definition.outcomeLabels);
    return [
      {
        marketId: definition.id,
        username: position.username,
        selection: definition.username,
        priceCents: position.averagePriceCents,
        totalCost: hasRemainingShares ? remainingCost : roundCoins(closedCost + fees),
        potentialPayout: position.quantity,
        status: hasRemainingShares && !realizedOnly ? settlement.status : "settled",
        payout: roundCoins(payout),
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

export const personalMarketPnl = (
  group: PredictionMarketGroup | undefined,
  states: PredictionMarketState[],
  username: string,
) => {
  if (!group) return { byMarketId: new Map<string, number>(), total: null };
  const account = username.toLowerCase();
  const byMarketId = predictionPnlByMarketId(
    buildBetHistory({
      predictionPositions: states.flatMap((state) =>
        (state.historyPositions ?? []).filter(
          (position) => position.username.toLowerCase() === account,
        ),
      ),
      predictionMarketGroups: [group],
      predictionMarketStates: states,
    }),
  );
  const total = [...byMarketId.values()].reduce((sum, pnl) => sum + pnl, 0);
  return { byMarketId, total: Math.abs(total) >= 0.005 ? total : null };
};
