import "./PredictionTrading.css";

import type {
  PredictionMarketDefinition,
  PredictionMarketState,
  PredictionOutcome,
} from "../../lib/predictionMarkets/predictionMarkets";
import {
  predictionMarketClinchNote,
  predictionMarketDisplayOutcomes,
  predictionOutcomeLabel,
} from "../../lib/predictionMarkets/predictionMarkets";
import { PredictionMarketExplainer } from "../PredictionMarketExplainer/PredictionMarketExplainer";
import { PredictionMarketIdentity } from "./PredictionMarketIdentity";
import { PredictionMarketPnl } from "./PredictionMarketPnl";
import { PredictionPositionHoldings } from "./PredictionPositionHoldings";
import { PredictionStrikeBets } from "./PredictionStrikeBets";

type PredictionResolvedMarketProps = {
  definition: PredictionMarketDefinition;
  density?: "compact" | "comfortable";
  displayedOutcome?: PredictionOutcome;
  displayedSettlementPriceCents?: number | null;
  pnl?: number | undefined;
  showHoldings?: boolean;
  state: PredictionMarketState;
};

export const PredictionResolvedMarket = ({
  definition,
  density = "comfortable",
  displayedOutcome,
  displayedSettlementPriceCents,
  pnl,
  showHoldings = false,
  state,
}: PredictionResolvedMarketProps) => {
  const outcome = displayedOutcome ?? state.market.outcome ?? "no";
  const settlementPriceCents =
    displayedSettlementPriceCents === undefined
      ? state.market.settlementPriceCents
      : displayedSettlementPriceCents;
  const visiblePnl = pnl !== undefined && Math.abs(pnl) >= 0.005 ? pnl : undefined;
  const clinchNote = predictionMarketClinchNote(definition.id);
  const outcomeLabel =
    state.market.status !== "resolved"
      ? state.market.status === "refunded"
        ? "Refunded"
        : "Closed"
      : settlementPriceCents === null
        ? predictionOutcomeLabel(definition, outcome)
        : `Settled ${settlementPriceCents}¢`;

  return (
    <div
      className="predictionSharedResolvedMarket"
      data-prediction-first-outcome={predictionMarketDisplayOutcomes(definition.id)[0]}
    >
      <span className="predictionSharedResolvedIdentity">
        <span className="predictionSharedStrikeHeading">
          <PredictionStrikeBets definition={definition} className="predictionSharedResolvedBets">
            <PredictionMarketIdentity definition={definition} density={density} />
          </PredictionStrikeBets>
          {clinchNote ? <PredictionMarketExplainer label="Clinch rules" text={clinchNote} /> : null}
        </span>
        {visiblePnl !== undefined ? (
          <PredictionMarketPnl value={visiblePnl} />
        ) : showHoldings && pnl === undefined ? (
          <PredictionPositionHoldings
            definition={definition}
            density={density}
            positions={state.positions}
          />
        ) : null}
      </span>
      <span
        className={`predictionSharedResolvedSide predictionSharedResolvedSide--${
          state.market.status === "resolved" && settlementPriceCents === null ? outcome : "price"
        }`}
      >
        {outcomeLabel}
      </span>
    </div>
  );
};
