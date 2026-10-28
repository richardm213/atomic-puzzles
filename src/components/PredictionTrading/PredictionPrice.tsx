import "./PredictionTrading.css";

type PredictionPriceProps = {
  cents: number;
};

export const PredictionPrice = ({ cents }: PredictionPriceProps) => (
  <span className="predictionSharedPrice" aria-label={`${cents} cents`}>
    <span aria-hidden="true">{cents}</span>
    <span className="predictionSharedPriceCent" aria-hidden="true">
      ¢
    </span>
  </span>
);
