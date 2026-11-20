import "./Betting.css";

import { Link } from "@tanstack/react-router";

import { InlineState } from "../../components/InlineState/InlineState";
import { PredictionOrderEditor } from "../../components/PredictionOrderEditor/PredictionOrderEditor";
import { BettingAccountSummary } from "../../components/PredictionTrading/BettingAccountSummary";
import { Seo } from "../../components/Seo/Seo";
import { getErrorMessage } from "../../utils/errors";
import { BettingHistory } from "./BettingHistory";
import { BettingMarketBrowser } from "./BettingMarketBrowser";
import { BettingOrderTicket } from "./BettingOrderTicket";
import { BettingSuggestions } from "./BettingSuggestions";
import { useBettingWorkspace } from "./useBettingWorkspace";

export const BettingPage = () => {
  const {
    view,
    selectView,
    myPendingBetCount,
    historyLoading,
    historyError,
    pendingBetCount,
    predictionCatalogQuery,
    auth: { isAuthenticated, authLoading, login },
    myBets,
    allHistoryBets,
    predictionMarketGroups,
    marketSummaries,
    countryByPlayer,
    editingOrderContext,
    setEditingOrderContext,
    applyOrderUpdate,
    browser,
    ticket,
  } = useBettingWorkspace();
  return (
    <div className="sitePage bettingPage">
      <Seo
        title="Betting"
        description="Use Atomic Coins to make fixed-price predictions."
        path="/betting"
      />
      <div className="bettingPanel">
        <header className="bettingHeader">
          <div>
            <h1>Betting</h1>
            <nav className="bettingHeaderLinks" aria-label="Betting links">
              <Link
                to="/tournaments/$tournamentId/$tournamentTab"
                params={{ tournamentId: "awc2026", tournamentTab: "main" }}
              >
                View bracket
              </Link>
            </nav>
          </div>
          <BettingAccountSummary />
        </header>

        <div className="bettingTabs" role="tablist" aria-label="Betting views">
          <button
            type="button"
            role="tab"
            aria-selected={view === "markets"}
            onClick={() => selectView("markets")}
          >
            Markets
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "mine"}
            onClick={() => selectView("mine")}
          >
            My bets{myPendingBetCount ? ` (${myPendingBetCount})` : ""}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "all"}
            onClick={() => selectView("all")}
          >
            All bets
            {!historyLoading && !historyError ? ` (${pendingBetCount})` : ""}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "suggestions"}
            onClick={() => selectView("suggestions")}
          >
            Suggestions
          </button>
        </div>

        {predictionCatalogQuery.error ? (
          <InlineState kind="error">
            {getErrorMessage(predictionCatalogQuery.error, "Unable to load markets.")}
          </InlineState>
        ) : null}

        {view === "markets" ? (
          <section className="bettingMarketView bettingMarketView--exchange" role="tabpanel">
            <BettingMarketBrowser {...browser} />
            <BettingOrderTicket {...ticket} />
          </section>
        ) : view === "suggestions" ? (
          <BettingSuggestions
            isAuthenticated={isAuthenticated}
            authLoading={authLoading}
            onLogin={() => void login("/betting")}
          />
        ) : (
          <BettingHistory
            key={view}
            view={view}
            isAuthenticated={isAuthenticated}
            authLoading={authLoading}
            onLogin={() => void login("/betting")}
            myBets={myBets}
            allBets={allHistoryBets}
            predictionMarketGroups={predictionMarketGroups}
            marketSummaries={marketSummaries}
            countryByPlayer={countryByPlayer}
            loading={historyLoading}
            error={historyError}
          />
        )}
      </div>
      {editingOrderContext ? (
        <PredictionOrderEditor
          marketId={editingOrderContext.marketId}
          outcome={editingOrderContext.outcome}
          orders={editingOrderContext.orders}
          onClose={() => setEditingOrderContext(null)}
          onUpdated={applyOrderUpdate}
        />
      ) : null}
    </div>
  );
};
