import "./PredictionTrading.css";

import { formatCoinValue } from "../../lib/coins/coinDisplay";

export const PredictionMarketRoi = ({ value }: { value: number }) => (
  <span
    className={`predictionSharedRoi predictionSharedRoi--${value >= 0 ? "profit" : "loss"}`}
    aria-label={`Return on investment: ${value >= 0 ? "plus " : "minus "}${formatCoinValue(
      Math.abs(value),
    )} coins`}
  >
    ROI {value > 0 ? "+" : ""}
    {formatCoinValue(value)} coins
  </span>
);
