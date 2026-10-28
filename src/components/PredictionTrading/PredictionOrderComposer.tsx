import "./PredictionTrading.css";

import type { ReactNode } from "react";

import type {
  PredictionMarketDefinition,
  PredictionOrderSide,
  PredictionOutcome,
} from "../../lib/predictionMarkets/predictionMarkets";
import {
  predictionOutcomeAbbreviation,
  predictionOutcomeCountryCode,
  predictionOutcomeLabel,
  predictionOutcomes,
} from "../../lib/predictionMarkets/predictionMarkets";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { PredictionPrice } from "./PredictionPrice";

type PredictionOrderComposerProps = {
  definition: PredictionMarketDefinition;
  density?: "compact" | "comfortable";
  idPrefix: string;
  onOutcomeChange: (outcome: PredictionOutcome) => void;
  onPriceChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onSideChange?: (side: PredictionOrderSide) => void;
  outcome: PredictionOutcome;
  outcomeDisabled?: (outcome: PredictionOutcome) => boolean;
  outcomePrices: Record<PredictionOutcome, number | undefined>;
  priceInput: string;
  primaryLabel: string;
  primaryValue: ReactNode;
  quantityInput: string;
  secondaryLabel: string;
  secondaryNote?: ReactNode;
  secondaryValue: ReactNode;
  showSell?: boolean;
  side?: PredictionOrderSide;
};

export const PredictionOrderComposer = ({
  definition,
  density = "comfortable",
  idPrefix,
  onOutcomeChange,
  onPriceChange,
  onQuantityChange,
  onSideChange,
  outcome,
  outcomeDisabled,
  outcomePrices,
  priceInput,
  primaryLabel,
  primaryValue,
  quantityInput,
  secondaryLabel,
  secondaryNote,
  secondaryValue,
  showSell = true,
  side = "buy",
}: PredictionOrderComposerProps) => (
  <div className={`predictionSharedComposer predictionSharedComposer--${density}`}>
    <div className="predictionSharedTicketHeader">
      <div className="predictionSharedSideTabs" role="group" aria-label="Order side">
        {onSideChange ? (
          (["buy", ...(showSell ? (["sell"] as const) : [])] as const).map((entry) => (
            <button
              type="button"
              aria-pressed={side === entry}
              onClick={() => onSideChange(entry)}
              key={entry}
            >
              {entry === "buy" ? "Buy" : "Sell"}
            </button>
          ))
        ) : (
          <strong>Buy</strong>
        )}
      </div>
      <span>Limit</span>
    </div>

    <div className="predictionSharedContract">
      <img
        src={countryCodeToFlagUrl(predictionOutcomeCountryCode(definition, outcome))}
        alt=""
        crossOrigin="anonymous"
        aria-hidden="true"
      />
      <strong>{predictionOutcomeLabel(definition, outcome)}</strong>
    </div>

    <div
      className={`predictionSharedOutcomePicker predictionSharedOutcomePicker--${side}`}
      role="group"
      aria-label="Prediction outcome"
    >
      {predictionOutcomes.map((entry) => (
        <button
          type="button"
          aria-pressed={outcome === entry}
          disabled={outcomeDisabled?.(entry)}
          onClick={() => onOutcomeChange(entry)}
          key={entry}
        >
          <span>{predictionOutcomeAbbreviation(definition, entry)}</span>
          <strong>
            {outcomePrices[entry] === undefined ? (
              "—"
            ) : (
              <PredictionPrice cents={outcomePrices[entry]} />
            )}
          </strong>
        </button>
      ))}
    </div>

    <div className="predictionSharedFields">
      <label className="predictionSharedField" htmlFor={`${idPrefix}-quantity`}>
        <span>Contracts</span>
        <input
          id={`${idPrefix}-quantity`}
          type="number"
          inputMode="numeric"
          min="1"
          max="10000"
          step="1"
          value={quantityInput}
          onChange={(event) => onQuantityChange(event.target.value)}
        />
      </label>
      <label className="predictionSharedField" htmlFor={`${idPrefix}-price`}>
        <span>Limit price</span>
        <span className="predictionSharedFieldValue">
          <input
            id={`${idPrefix}-price`}
            type="number"
            inputMode="numeric"
            min="1"
            max="99"
            step="1"
            value={priceInput}
            onChange={(event) => onPriceChange(event.target.value)}
          />
          <span>¢</span>
        </span>
      </label>
    </div>

    <dl className="predictionSharedSummary">
      <div>
        <dt>{primaryLabel}</dt>
        <dd>{primaryValue}</dd>
      </div>
      <div>
        <dt>{secondaryLabel}</dt>
        <dd>
          <strong>{secondaryValue}</strong>
          {secondaryNote ? <small>{secondaryNote}</small> : null}
        </dd>
      </div>
    </dl>
  </div>
);
