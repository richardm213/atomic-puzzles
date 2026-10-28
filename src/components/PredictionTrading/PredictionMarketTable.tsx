import "./PredictionTrading.css";

import type { ReactNode } from "react";

import type {
  PredictionMarketDefinition,
  PredictionMarketId,
  PredictionMarketState,
  PredictionOutcome,
} from "../../lib/predictionMarkets/predictionMarkets";
import {
  predictionOutcomeAbbreviation,
  predictionOutcomeLabel,
  predictionOutcomes,
  predictionYesChance,
  suggestedPredictionPrice,
} from "../../lib/predictionMarkets/predictionMarkets";
import { PredictionMarketIdentity } from "./PredictionMarketIdentity";
import { PredictionPositionHoldings } from "./PredictionPositionHoldings";
import { PredictionPrice } from "./PredictionPrice";

type OutcomeAvailability = {
  disabled?: boolean;
  title?: string | undefined;
};

type PredictionMarketTableProps = {
  activeMarketId?: PredictionMarketId | null | undefined;
  density?: "compact" | "comfortable";
  definitions: readonly PredictionMarketDefinition[];
  expandedOutcome?: PredictionOutcome;
  expandedMarketId?: PredictionMarketId | null;
  flush?: boolean;
  isAuthenticated?: boolean;
  onSelectOutcome: (
    definition: PredictionMarketDefinition,
    outcome: PredictionOutcome,
    suggestedPrice: number,
  ) => void;
  onToggleMarket: (definition: PredictionMarketDefinition) => void;
  outcomeAvailability?: (
    definition: PredictionMarketDefinition,
    outcome: PredictionOutcome,
  ) => OutcomeAvailability | undefined;
  renderExpandedContent?: (
    definition: PredictionMarketDefinition,
    state: PredictionMarketState,
    outcome: PredictionOutcome,
  ) => ReactNode;
  selectedOutcome?: PredictionOutcome | undefined;
  states: ReadonlyMap<PredictionMarketId, PredictionMarketState>;
};

export const PredictionMarketTable = ({
  activeMarketId,
  density = "comfortable",
  definitions,
  expandedOutcome = "yes",
  expandedMarketId,
  flush = false,
  isAuthenticated = false,
  onSelectOutcome,
  onToggleMarket,
  outcomeAvailability,
  renderExpandedContent,
  selectedOutcome,
  states,
}: PredictionMarketTableProps) => (
  <div
    className={`predictionSharedMarketTable predictionSharedMarketTable--${density}${
      flush ? " predictionSharedMarketTable--flush" : ""
    }`}
  >
    <div className="predictionSharedMarketTableHeader" aria-hidden="true">
      <span />
      <span>Chance</span>
      <span />
    </div>
    {definitions.map((definition) => {
      const state = states.get(definition.id);
      const isResolved = state?.market.status === "resolved";
      const isExpanded = expandedMarketId === definition.id && !isResolved;
      const chance = predictionYesChance(definition, state);
      const selectedMarket = activeMarketId === definition.id;
      const drawerId = `prediction-market-table-${definition.id}`;

      return (
        <div
          className={`predictionSharedMarketRow${
            selectedMarket && !isResolved ? " predictionSharedMarketRow--active" : ""
          }${isResolved ? " predictionSharedMarketRow--resolved" : ""}`}
          key={definition.id}
        >
          {isResolved ? (
            <div className="predictionSharedMarketIdentity">
              <PredictionMarketIdentity definition={definition} density={density} />
              {isAuthenticated ? (
                <PredictionPositionHoldings
                  definition={definition}
                  density={density}
                  positions={state?.positions ?? []}
                />
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              className="predictionSharedMarketToggle"
              aria-expanded={isExpanded}
              aria-controls={drawerId}
              onClick={() => onToggleMarket(definition)}
            >
              <span className="predictionSharedMarketIdentity">
                <PredictionMarketIdentity definition={definition} density={density} />
                {isAuthenticated ? (
                  <PredictionPositionHoldings
                    definition={definition}
                    density={density}
                    positions={state?.positions ?? []}
                  />
                ) : null}
              </span>
              <span className="predictionSharedMarketChance">
                <strong>{chance === undefined ? "—" : `${chance}%`}</strong>
              </span>
            </button>
          )}

          {isResolved ? (
            <span
              className={`predictionSharedMarketResolved predictionSharedMarketResolved--${
                state?.market.settlementPriceCents === null
                  ? (state.market.outcome ?? "no")
                  : "price"
              }`}
            >
              {state?.market.settlementPriceCents === null ||
              state?.market.settlementPriceCents === undefined
                ? predictionOutcomeLabel(definition, state?.market.outcome ?? "no")
                : `Settled ${state.market.settlementPriceCents}¢`}
            </span>
          ) : (
            <span
              className="predictionSharedMarketPrices"
              aria-label={`${definition.username} outcome`}
            >
              {predictionOutcomes.map((entry) => {
                const displayedPrice = state?.book[entry].asks[0]?.priceCents;
                const availability = outcomeAvailability?.(definition, entry);
                const selected = selectedMarket && selectedOutcome === entry;
                return (
                  <button
                    type="button"
                    className={`predictionSharedMarketPrice predictionSharedMarketPrice--${entry}`}
                    aria-pressed={selected}
                    disabled={availability?.disabled}
                    title={availability?.title}
                    onClick={() =>
                      onSelectOutcome(
                        definition,
                        entry,
                        suggestedPredictionPrice(definition, state, entry),
                      )
                    }
                    key={entry}
                  >
                    <span>{predictionOutcomeAbbreviation(definition, entry)}</span>
                    <span>
                      {displayedPrice === undefined ? (
                        "—"
                      ) : (
                        <PredictionPrice cents={displayedPrice} />
                      )}
                    </span>
                  </button>
                );
              })}
            </span>
          )}

          {isExpanded && state && renderExpandedContent ? (
            <div className="predictionSharedMarketDrawer" id={drawerId}>
              {renderExpandedContent(definition, state, expandedOutcome)}
            </div>
          ) : null}
        </div>
      );
    })}
  </div>
);

export type { OutcomeAvailability };
