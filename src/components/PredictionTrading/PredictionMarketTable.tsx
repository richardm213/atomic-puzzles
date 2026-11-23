import "./PredictionTrading.css";

import type { ReactNode } from "react";

import type {
  PredictionMarketDefinition,
  PredictionMarketId,
  PredictionMarketState,
  PredictionOutcome,
} from "../../lib/predictionMarkets/predictionMarkets";
import {
  predictionMarketClinchNote,
  predictionOutcomeAbbreviation,
  predictionOutcomes,
  predictionYesChance,
  sortPredictionMarketsByChance,
  suggestedPredictionPrice,
} from "../../lib/predictionMarkets/predictionMarkets";
import { PredictionMarketExplainer } from "../PredictionMarketExplainer/PredictionMarketExplainer";
import { PredictionMarketIdentity } from "./PredictionMarketIdentity";
import { PredictionMarketPnl } from "./PredictionMarketPnl";
import { PredictionPendingOrders } from "./PredictionPendingOrders";
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
  pnlByMarketId?: ReadonlyMap<PredictionMarketId, number>;
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
  pnlByMarketId,
  selectedOutcome,
  states,
}: PredictionMarketTableProps) => (
  <div
    className={`predictionSharedMarketTable predictionSharedMarketTable--${density}${
      flush ? " predictionSharedMarketTable--flush" : ""
    }`}
  >
    {sortPredictionMarketsByChance(definitions, states).map((definition) => {
      const state = states.get(definition.id);
      const isCompleted = state !== undefined && state.market.status !== "open";
      const isExpanded = expandedMarketId === definition.id && !isCompleted;
      const chance = predictionYesChance(definition, state);
      const selectedMarket = activeMarketId === definition.id;
      const pnl = pnlByMarketId?.get(definition.id);
      const drawerId = `prediction-market-table-${definition.id}`;
      const clinchNote = predictionMarketClinchNote(definition.id);

      return (
        <div
          className={`predictionSharedMarketRow${
            selectedMarket && !isCompleted ? " predictionSharedMarketRow--active" : ""
          }${isCompleted ? " predictionSharedMarketRow--resolved" : ""}`}
          key={definition.id}
        >
          {isCompleted ? (
            <PredictionResolvedMarket
              definition={definition}
              density={density}
              pnl={pnl}
              showHoldings={isAuthenticated}
              state={state}
            />
          ) : (
            <div
              className={`predictionSharedMarketSummary${clinchNote ? " predictionSharedMarketSummary--with-rules" : ""}`}
            >
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
                    <>
                      <PredictionPositionHoldings
                        definition={definition}
                        density={density}
                        positions={state?.positions ?? []}
                      />
                      {state ? (
                        <PredictionMarketPnl value={pnl} positions={state.positions} />
                      ) : null}
                    </>
                  ) : null}
                </span>
                <span className="predictionSharedMarketChance">
                  <strong>{chance === undefined ? "—" : `${chance}%`}</strong>
                </span>
              </button>
              {clinchNote ? (
                <span className="predictionSharedMarketRules">
                  <PredictionMarketExplainer label="Clinch rules" text={clinchNote} />
                </span>
              ) : null}
              {isAuthenticated ? (
                <PredictionPendingOrders definition={definition} orders={state?.orders ?? []} />
              ) : null}
            </div>
          )}

          {!isCompleted ? (
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
