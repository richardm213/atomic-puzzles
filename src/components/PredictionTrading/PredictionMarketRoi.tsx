import "./PredictionTrading.css";

import { formatCoinValue } from "../../lib/coins/coinDisplay";

export const PredictionMarketRoi = ({ value }: { value: number }) => (
  <span
    className={`predictionSharedRoi predictionSharedRoi--${value >= 0 ? "profit" : "loss"}`}
    aria-label={`Profit and loss: ${value >= 0 ? "plus " : "minus "}${formatCoinValue(
      Math.abs(value),
    )} coins`}
  >
    P&amp;L {value > 0 ? "+" : ""}
    {formatCoinValue(value)} coins
  </span>
);
