import "./PredictionTrading.css";

import { faPen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { CSSProperties } from "react";

import { formatCoinBalance } from "../../lib/coins/coinDisplay";
import type {
  PredictionOrder,
  PredictionOutcome,
} from "../../lib/predictionMarkets/predictionMarkets";
import { predictionOrderAppearsAtLevel } from "../../lib/predictionMarkets/predictionMarkets";

type BookLevel = { priceCents: number; quantity: number };

type PredictionOrderBookProps = {
  asks: BookLevel[];
  bids: BookLevel[];
  density?: "compact" | "comfortable";
  headingLevel?: 2 | 3;
  maxRows?: number;
  onEditOrders: (orders: PredictionOrder[]) => void;
  onSelect: (side: "ask" | "bid", priceCents: number, quantity: number) => void;
  outcome: PredictionOutcome;
  outcomeName: string;
  ownOrders: PredictionOrder[];
  showCoinValue?: boolean;
  title?: string;
  titleId?: string;
};

export const PredictionOrderBook = ({
  asks,
  bids,
  density = "comfortable",
  headingLevel = 2,
  maxRows,
  onEditOrders,
  onSelect,
  outcome,
  outcomeName,
  ownOrders,
  showCoinValue = true,
  title = "Order book",
  titleId,
}: PredictionOrderBookProps) => {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const visibleAsks = maxRows === undefined ? asks : asks.slice(0, maxRows);
  const visibleBids = maxRows === undefined ? bids : bids.slice(0, maxRows);

  const renderLevels = (levels: BookLevel[], side: "ask" | "bid") => {
    if (!levels.length) return <p className="predictionSharedBookEmpty">No {side}s</p>;
    const totalQuantity = levels.reduce((total, level) => total + level.quantity, 0);

    return levels.map((level, index) => {
      const ordersAtLevel = ownOrders.filter((order) =>
        predictionOrderAppearsAtLevel(order, outcome, side, level.priceCents),
      );
      const coinValue = (level.priceCents * level.quantity) / 100;
      const cumulativeQuantity =
        side === "ask"
          ? levels.slice(index).reduce((total, entry) => total + entry.quantity, 0)
          : levels.slice(0, index + 1).reduce((total, entry) => total + entry.quantity, 0);
      const barWidth = Math.max(2, (cumulativeQuantity / totalQuantity) * 72);

      return (
        <div className="predictionSharedBookLevelWrap" key={`${side}-${level.priceCents}`}>
          <button
            type="button"
            className={`predictionSharedBookLevel predictionSharedBookLevel--${side}`}
            style={{ "--prediction-book-bar": `${barWidth}%` } as CSSProperties}
            aria-label={`${side === "ask" ? "Ask" : "Bid"} ${level.priceCents} cents, ${level.quantity.toLocaleString()} contracts, ${formatCoinBalance(coinValue)} coins`}
            onClick={() => onSelect(side, level.priceCents, level.quantity)}
          >
            <strong>{level.priceCents}¢</strong>
            <span>{side === "ask" ? "Ask" : "Bid"}</span>
            <b>{level.quantity.toLocaleString()}</b>
            {showCoinValue ? <b>{formatCoinBalance(coinValue)} coins</b> : null}
          </button>
          {ordersAtLevel.length ? (
            <button
              type="button"
              className="predictionSharedOwnOrderButton"
              aria-label={`Edit your order at ${level.priceCents} cents`}
              title="Your order — edit"
              onClick={() => onEditOrders(ordersAtLevel)}
            >
              <FontAwesomeIcon icon={faPen} />
            </button>
          ) : null}
        </div>
      );
    });
  };

  return (
    <div
      className={`predictionSharedBook predictionSharedBook--${density}${showCoinValue ? "" : " predictionSharedBook--threeColumns"}`}
    >
      <div className="predictionSharedBookHeader">
        <Heading id={titleId}>{title}</Heading>
      </div>
      <div className="predictionSharedBookLabels" aria-hidden="true">
        <span>Price</span>
        <span>Side</span>
        <span>Contracts</span>
        {showCoinValue ? <span>Coin value</span> : null}
      </div>
      <div className="predictionSharedBookLevels">
        {renderLevels([...visibleAsks].reverse(), "ask")}
        <div
          className={`predictionSharedBookTrade predictionSharedBookTrade--${outcome}`}
          aria-label={`Trading ${outcomeName}`}
        >
          Trade {outcomeName}
        </div>
        {renderLevels(visibleBids, "bid")}
      </div>
    </div>
  );
};
