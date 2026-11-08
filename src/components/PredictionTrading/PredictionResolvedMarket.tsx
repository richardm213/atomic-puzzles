import "./PredictionTrading.css";

import { formatCoinValue } from "../../lib/coins/coinDisplay";
import type {
  PredictionMarketDefinition,
  PredictionMarketState,
  PredictionOutcome,
} from "../../lib/predictionMarkets/predictionMarkets";
import { predictionOutcomeLabel } from "../../lib/predictionMarkets/predictionMarkets";
import { PredictionMarketIdentity } from "./PredictionMarketIdentity";
import { PredictionPositionHoldings } from "./PredictionPositionHoldings";
import { PredictionStrikeBets } from "./PredictionStrikeBets";

type PredictionResolvedMarketProps = {
  definition: PredictionMarketDefinition;
  density?: "compact" | "comfortable";
  displayedOutcome?: PredictionOutcome;
  displayedSettlementPriceCents?: number | null;
  pnl?: number | undefined;
  showHoldings?: boolean;
  state: PredictionMarketState;
};

export const PredictionResolvedMarket = ({
  definition,
  density = "comfortable",
  displayedOutcome,
  displayedSettlementPriceCents,
  pnl,
  showHoldings = false,
  state,
}: PredictionResolvedMarketProps) => {
  const outcome = displayedOutcome ?? state.market.outcome ?? "no";
  const settlementPriceCents =
    displayedSettlementPriceCents === undefined
      ? state.market.settlementPriceCents
      : displayedSettlementPriceCents;
  const visiblePnl = pnl !== undefined && Math.abs(pnl) >= 0.005 ? pnl : undefined;
  const outcomeLabel =
    settlementPriceCents === null
      ? predictionOutcomeLabel(definition, outcome)
      : `Settled ${settlementPriceCents}¢`;

  return (
    <div className="predictionSharedResolvedMarket">
      <span className="predictionSharedResolvedIdentity">
        <PredictionStrikeBets definition={definition} className="predictionSharedResolvedBets">
          <PredictionMarketIdentity definition={definition} density={density} />
        </PredictionStrikeBets>
        {visiblePnl !== undefined ? (
          <span
            className={`predictionSharedMarketPnl${
              visiblePnl > 0
                ? " predictionSharedMarketPnl--profit"
                : " predictionSharedMarketPnl--loss"
            }`}
            aria-label={`Your profit: ${visiblePnl > 0 ? "+" : ""}${formatCoinValue(
              visiblePnl,
            )} coins`}
          >
            {visiblePnl > 0 ? "+" : ""}
            {formatCoinValue(visiblePnl)} coins
          </span>
        ) : showHoldings && pnl === undefined ? (
          <PredictionPositionHoldings
            definition={definition}
            density={density}
            positions={state.positions}
          />
        ) : null}
      </span>
      <span
        className={`predictionSharedResolvedSide predictionSharedResolvedSide--${
          settlementPriceCents === null ? outcome : "price"
        }`}
      >
        {outcomeLabel}
      </span>
    </div>
  );
};
