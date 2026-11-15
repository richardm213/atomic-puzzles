import "./PredictionTrading.css";

import { formatCoinValue } from "../../lib/coins/coinDisplay";
import type { PredictionPosition } from "../../lib/predictionMarkets/predictionMarkets";

export const PredictionMarketPnl = ({
  value,
  positions,
}: {
  value: number | undefined;
  // Open strikes show this in place of holdings only after the position is fully exited.
  positions?: readonly PredictionPosition[];
}) => {
  if (value === undefined || positions?.some((position) => position.quantity > 0)) return null;
  const pnl = Math.abs(value) < 0.005 ? 0 : value;
  return (
    <span
      className={`predictionSharedMarketPnl${pnl > 0 ? " predictionSharedMarketPnl--profit" : pnl < 0 ? " predictionSharedMarketPnl--loss" : ""}`}
      aria-label={`Your profit: ${pnl > 0 ? "+" : ""}${formatCoinValue(pnl)} coins`}
    >
      {pnl > 0 ? "+" : ""}
      {formatCoinValue(pnl)} coins
    </span>
  );
};
