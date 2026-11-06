import "./PredictionTrading.css";

type PredictionMarketStatusProps = {
  density?: "compact" | "comfortable";
  status: "closed" | "loading" | "open";
};

export const PredictionMarketStatus = ({
  density = "compact",
  status,
}: PredictionMarketStatusProps) => (
  <span
    className={`predictionSharedStatus predictionSharedStatus--${status} predictionSharedStatus--${density}`}
  >
    {status === "loading" ? "Loading" : status === "open" ? "Open" : "Closed"}
  </span>
);
