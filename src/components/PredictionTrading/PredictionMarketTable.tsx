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
  predictionOutcomes,
  predictionYesChance,
  sortPredictionMarketsByChance,
  suggestedPredictionPrice,
} from "../../lib/predictionMarkets/predictionMarkets";
import { PredictionMarketIdentity } from "./PredictionMarketIdentity";
import { PredictionPositionHoldings } from "./PredictionPositionHoldings";
import { PredictionPrice } from "./PredictionPrice";
import { PredictionResolvedMarket } from "./PredictionResolvedMarket";

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
  resolvedPnlByMarketId?: ReadonlyMap<PredictionMarketId, number>;
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
  resolvedPnlByMarketId,
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
    {sortPredictionMarketsByChance(definitions, states).map((definition) => {
      const state = states.get(definition.id);
      const isResolved = state?.market.status === "resolved";
      const isExpanded = expandedMarketId === definition.id && !isResolved;
      const chance = predictionYesChance(definition, state);
      const selectedMarket = activeMarketId === definition.id;
      const resolvedPnl = resolvedPnlByMarketId?.get(definition.id);
      const drawerId = `prediction-market-table-${definition.id}`;

      return (
        <div
          className={`predictionSharedMarketRow${
            selectedMarket && !isResolved ? " predictionSharedMarketRow--active" : ""
          }${isResolved ? " predictionSharedMarketRow--resolved" : ""}`}
          key={definition.id}
        >
          {isResolved ? (
            <PredictionResolvedMarket
              definition={definition}
              density={density}
              pnl={resolvedPnl}
              showHoldings={isAuthenticated}
              state={state}
            />
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

          {!isResolved ? (
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
          ) : null}

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
