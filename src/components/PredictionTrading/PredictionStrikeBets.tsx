import "../../pages/Betting/Betting.css";
import "./PredictionStrikeBets.css";

import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { strikePredictionPositionsQueryOptions } from "../../lib/betting/bettingQueries";
import { predictionMarketCatalogQueryOptions } from "../../lib/predictionMarkets/predictionMarketQueries";
import {
  type PredictionMarketDefinition,
  predictionMarketDisplayOutcomes,
  predictionOutcomeLabel,
} from "../../lib/predictionMarkets/predictionMarkets";
import { BetHistoryTable } from "../../pages/Betting/BettingHistory";
import { buildBetHistory } from "../../pages/Betting/bettingHistoryModel";
import { getErrorMessage } from "../../utils/errors";
import { InlineState } from "../InlineState/InlineState";
import { PredictionPriceChart } from "./PredictionPriceChart";
import { PredictionTraderHistory } from "./PredictionTraderHistory";

const StrikeBetList = ({
  definition,
  onSelectBettor,
}: {
  definition: PredictionMarketDefinition;
  onSelectBettor: (username: string) => void;
}) => {
  const positions = useQuery(strikePredictionPositionsQueryOptions(definition.id));
  const catalog = useQuery(predictionMarketCatalogQueryOptions());
  const error = positions.error ?? catalog.error;
  if (error)
    return <InlineState kind="error">{getErrorMessage(error, "Unable to load bets.")}</InlineState>;
  if (positions.isPending || catalog.isPending) {
    return <p role="status">Loading bets…</p>;
  }
  if (
    !positions.data?.markets.some(
      (market) => market.id === definition.id && market.status !== "open",
    )
  ) {
    return <InlineState kind="empty">This strike is still pending.</InlineState>;
  }
  const bets = buildBetHistory({
    predictionPositions: positions.data?.positions ?? [],
    predictionMarketGroups: catalog.data ?? [],
    marketSummaries: positions.data?.markets ?? [],
    realizedOnly: true,
  }).filter((bet) => bet.marketId === definition.id);
  return (
    <BetHistoryTable
      bets={bets}
      countryByPlayer={{}}
      emptyMessage="No bets on this strike yet."
      showUsername
      returnDisplay="pnl"
      priceLabel="Avg. price"
      showStatus={false}
      showMarket={false}
      showUnits={false}
      sortable
      onSelectBet={(bet) => onSelectBettor(bet.username)}
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
  const [selectedBettor, setSelectedBettor] = useState<string | null>(null);
  const [tab, setTab] = useState<"pnl" | "chart">("pnl");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const title = definition.outcomeLabels
    ? predictionMarketDisplayOutcomes(definition.id)
        .map((outcome) => predictionOutcomeLabel(definition, outcome))
        .join(" vs ")
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
          setSelectedBettor(null);
          setTab("pnl");
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
              <div className="predictionStrikeTabs" role="tablist" aria-label="Strike details">
                {(["pnl", "chart"] as const).map((entry) => (
                  <button
                    type="button"
                    key={entry}
                    role="tab"
                    id={`${titleId}-${entry}`}
                    aria-selected={tab === entry}
                    aria-controls={`${titleId}-panel`}
                    tabIndex={tab === entry ? 0 : -1}
                    onClick={() => {
                      setSelectedBettor(null);
                      setTab(entry);
                    }}
                    onKeyDown={(event) => {
                      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                      event.preventDefault();
                      event.stopPropagation();
                      const next =
                        event.key === "Home"
                          ? "pnl"
                          : event.key === "End"
                            ? "chart"
                            : entry === "pnl"
                              ? "chart"
                              : "pnl";
                      setSelectedBettor(null);
                      setTab(next);
                      document.getElementById(`${titleId}-${next}`)?.focus();
                    }}
                  >
                    {entry === "pnl" ? "P&L" : "Price chart"}
                  </button>
                ))}
              </div>
              <div
                className="predictionStrikeBetsBody"
                id={`${titleId}-panel`}
                role="tabpanel"
                aria-labelledby={`${titleId}-${tab}`}
              >
                {tab === "pnl" ? (
                  selectedBettor ? (
                    <PredictionTraderHistory
                      definition={definition}
                      username={selectedBettor}
                      onBack={() => {
                        const username = selectedBettor;
                        setSelectedBettor(null);
                        requestAnimationFrame(() =>
                          dialog.current
                            ?.querySelector<HTMLButtonElement>(
                              `button[aria-label="View transactions for ${username}"]`,
                            )
                            ?.focus(),
                        );
                      }}
                    />
                  ) : (
                    <StrikeBetList definition={definition} onSelectBettor={setSelectedBettor} />
                  )
                ) : (
                  <PredictionPriceChart definition={definition} />
                )}
              </div>
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
};
