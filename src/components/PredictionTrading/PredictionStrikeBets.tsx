import "../../pages/Betting/Betting.css";
import "./PredictionStrikeBets.css";

import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  allPredictionPositionsQueryOptions,
  allTournamentBetsQueryOptions,
} from "../../lib/betting/bettingQueries";
import {
  predictionMarketBatchQueryOptions,
  predictionMarketCatalogQueryOptions,
} from "../../lib/predictionMarkets/predictionMarketQueries";
import type { PredictionMarketDefinition } from "../../lib/predictionMarkets/predictionMarkets";
import { BetHistoryTable } from "../../pages/Betting/BettingHistory";
import { buildBetHistory } from "../../pages/Betting/bettingHistoryModel";
import { getErrorMessage } from "../../utils/errors";
import { InlineState } from "../InlineState/InlineState";

const StrikeBetList = ({ definition }: { definition: PredictionMarketDefinition }) => {
  const positions = useQuery({ ...allPredictionPositionsQueryOptions(), refetchInterval: 15_000 });
  const legacy = useQuery(allTournamentBetsQueryOptions());
  const catalog = useQuery(predictionMarketCatalogQueryOptions());
  const states = useQuery(predictionMarketBatchQueryOptions([definition.id]));
  const error = positions.error ?? legacy.error ?? catalog.error ?? states.error;
  if (error)
    return <InlineState kind="error">{getErrorMessage(error, "Unable to load bets.")}</InlineState>;
  if (positions.isPending || legacy.isPending || catalog.isPending || states.isPending) {
    return <p role="status">Loading bets…</p>;
  }
  if (!states.data?.some((state) => ["resolved", "refunded"].includes(state.market.status))) {
    return <InlineState kind="empty">This strike is still pending.</InlineState>;
  }
  const bets = buildBetHistory({
    tournamentBets: legacy.data ?? [],
    predictionPositions: positions.data ?? [],
    predictionMarketGroups: catalog.data ?? [],
    predictionMarketStates: states.data ?? [],
    minimumPositionCost: 0,
  })
    .filter((bet) => bet.marketId === definition.id)
    .map((bet) => {
      const position = positions.data?.find(
        (position) =>
          position.marketId === bet.marketId &&
          position.username === bet.username &&
          position.outcome === bet.predictionOutcome,
      );
      return {
        ...bet,
        priceCents: Math.round((position?.averagePriceCents ?? bet.priceCents) * 10) / 10,
      };
    })
    .sort((left, right) => right.totalCost - left.totalCost);
  return (
    <BetHistoryTable
      bets={bets}
      markets={[]}
      countryByPlayer={{}}
      emptyMessage="No bets on this strike yet."
      showUsername
      returnDisplay="pnl"
      priceLabel="Avg. price"
      showStatus={false}
      showMarket={false}
      showUnits={false}
      sortable
    />
  );
};

export const PredictionStrikeBets = ({
  definition,
  children,
  className,
}: {
  definition: PredictionMarketDefinition;
  children: ReactNode;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const title = definition.outcomeLabels
    ? `${definition.outcomeLabels.yes} vs ${definition.outcomeLabels.no}`
    : definition.username;
  useEffect(() => {
    const pane = dialog.current;
    if (!open || !pane) return;
    pane.showModal();
  }, [open]);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-haspopup="dialog"
        aria-label={`View bets on ${title}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        {children}
      </button>
      {open
        ? createPortal(
            <dialog
              ref={dialog}
              className="predictionStrikeBetsDialog"
              aria-labelledby={titleId}
              onClose={() => setOpen(false)}
            >
              <header>
                <h2 id={titleId}>{title}</h2>
                <button
                  type="button"
                  aria-label="Close bets"
                  onClick={() => dialog.current?.close()}
                >
                  ×
                </button>
              </header>
              <div className="predictionStrikeBetsBody">
                <StrikeBetList definition={definition} />
              </div>
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
};
