import "./PredictionTrading.css";

import type {
  PredictionMarketDefinition,
  PredictionPosition,
} from "../../lib/predictionMarkets/predictionMarkets";
import {
  formatPredictionAveragePrice,
  formatPredictionShares,
  predictionOutcomeLabel,
} from "../../lib/predictionMarkets/predictionMarkets";

type PredictionPositionHoldingsProps = {
  definition: PredictionMarketDefinition;
  density?: "compact" | "comfortable";
  positions: PredictionPosition[];
};

export const PredictionPositionHoldings = ({
  definition,
  density = "comfortable",
  positions,
}: PredictionPositionHoldingsProps) => {
  const ownedPositions = positions.filter((position) => position.quantity > 0);
  if (!ownedPositions.length) return null;

  return (
    <span
      className={`predictionSharedHoldings predictionSharedHoldings--${density}`}
      aria-label="Your position"
    >
      {ownedPositions.map((position) => {
        const averagePrice = formatPredictionAveragePrice(position.averagePriceCents);
        return (
          <span
            className={`predictionSharedHolding predictionSharedHolding--${position.outcome}`}
            key={position.outcome}
          >
            <span className="predictionSharedHoldingCheck" aria-hidden="true">
              ✓
            </span>
            <strong>
              {`${formatPredictionShares(position.quantity)} ${predictionOutcomeLabel(
                definition,
                position.outcome,
              )}`}
            </strong>
            {averagePrice ? (
              <span className="predictionSharedHoldingPrice">({averagePrice})</span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
};
