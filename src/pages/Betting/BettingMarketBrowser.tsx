import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { InlineState } from "../../components/InlineState/InlineState";
import { PredictionMarketExplainer } from "../../components/PredictionMarketExplainer/PredictionMarketExplainer";
import { PredictionMarketGroupHeader } from "../../components/PredictionTrading/PredictionMarketGroupHeader";
import { PredictionMarketIdentity } from "../../components/PredictionTrading/PredictionMarketIdentity";
import { PredictionMarketPnl } from "../../components/PredictionTrading/PredictionMarketPnl";
import { PredictionMarketTable } from "../../components/PredictionTrading/PredictionMarketTable";
import { PredictionOrderBook } from "../../components/PredictionTrading/PredictionOrderBook";
import { PredictionResolvedMarket } from "../../components/PredictionTrading/PredictionResolvedMarket";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { predictionOrderRestrictionMessage } from "../../lib/betting/betting";
import { formatCoinVolume } from "../../lib/coins/coinDisplay";
import {
  formatPredictionChance,
  predictionMarketClinchNote,
  predictionMarketDisplayOutcomes,
  predictionOutcomeCountryCode,
  predictionOutcomeLabel,
  predictionSportsbookButtonsOnly,
  predictionSportsbookOutcomeLabel,
  suggestedPredictionPrice,
} from "../../lib/predictionMarkets/predictionMarkets";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { getErrorMessage } from "../../utils/errors";
import {
  isWinnerCategory,
  otherMarketCategories,
  predictionMarketCategories,
  type useBettingWorkspace,
} from "./useBettingWorkspace";

const singleColumnGroups = new Set([
  "awc-2026-round-of-16",
  "awc-2026-quarterfinals",
  "awc-2026-semifinals",
  "awc-2026-losers-round-1",
  "awc-2026-losers-round-2",
  "awc-2026-losers-round-3",
]);

export const BettingMarketBrowser = ({
  marketCategory,
  selectMarketCategory,
  activePredictionGroup,
  predictionMarketOnlyCategory,
  selectDisplayMode,
  predictionCatalogQuery,
  predictionMarketQuery,
  activePredictionDisplayMode,
  activePredictionGroupLoading,
  activePredictionGroupOpen,
  winnerPosition,
  selectWinnerPosition,
  activePredictionGroupPnl,
  activePredictionVolume,
  sortedActivePredictionMarkets,
  predictionStateByMarketId,
  personalPredictionPnlByMarketId,
  predictionSelection,
  predictionRestrictionFor,
  choosePredictionOutcome,
  isAuthenticated,
  expandedStrike,
  togglePredictionStrike,
  setEditingOrderContext,
  startOrderFromBook,
}: ReturnType<typeof useBettingWorkspace>["browser"]) => {
  const winnerMarket = isWinnerCategory(marketCategory);
  const isOtherMarket = otherMarketCategories.includes(marketCategory);
  const sportsbook = activePredictionDisplayMode === "book";
  const restrictionTitle = (restriction: ReturnType<typeof predictionRestrictionFor>) =>
    restriction
      ? predictionOrderRestrictionMessage(restriction, activePredictionGroup?.id)
      : undefined;
  const groupHeader = activePredictionGroup && {
    isLoading: activePredictionGroupLoading,
    isOpen: activePredictionGroupOpen,
    path: activePredictionGroup.path,
    pnl: activePredictionGroupPnl,
    title: activePredictionGroup.title,
    volume: formatCoinVolume(activePredictionVolume),
  };

  return (
    <div className="bettingMarketColumn">
      <div className="bettingCategories" aria-label="Market categories">
        {predictionMarketCategories
          .filter((category) => !otherMarketCategories.includes(category))
          .map((category) => (
            <button
              type="button"
              aria-pressed={marketCategory === category}
              onClick={() => selectMarketCategory(category)}
              key={category}
            >
              {category.replace(/^2026 /, "")}
            </button>
          ))}
        <select
          aria-label="Other markets"
          data-active={isOtherMarket}
          value={isOtherMarket ? marketCategory : ""}
          onChange={(event) => selectMarketCategory(event.target.value)}
        >
          <option value="" disabled>
            Other markets
          </option>
          {otherMarketCategories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      {activePredictionGroup && !predictionMarketOnlyCategory ? (
        <div className="bettingPredictionViewControl">
          <div className="bettingPredictionModeToggle" role="group" aria-label="Betting view">
            {(["book", "market"] as const).map((mode) => (
              <button
                type="button"
                aria-pressed={activePredictionDisplayMode === mode}
                onClick={() => selectDisplayMode(mode)}
                key={mode}
              >
                {activePredictionDisplayMode === mode ? (
                  <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                ) : null}
                {mode === "book" ? "Sportsbook view" : "Order book view"}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="bettingMarketList">
        {predictionCatalogQuery.isPending ? <RouteLoadingFallback /> : null}
        {predictionMarketQuery.error ? (
          <InlineState kind="error">
            {getErrorMessage(predictionMarketQuery.error, "Unable to load market prices.")}
          </InlineState>
        ) : null}
        {activePredictionGroup && groupHeader && sportsbook ? (
          <section
            className={`bettingMarketGroup bettingPredictionBookGroup${singleColumnGroups.has(activePredictionGroup.id) ? " bettingPredictionBookGroup--singleColumn" : ""}`}
          >
            <PredictionMarketGroupHeader
              {...groupHeader}
              middle={
                winnerMarket ? (
                  <div className="bettingPositionToggle" role="group" aria-label="Winner side">
                    <button
                      type="button"
                      aria-pressed={winnerPosition === "yes"}
                      onClick={() => selectWinnerPosition("yes")}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      aria-pressed={winnerPosition === "no"}
                      onClick={() => selectWinnerPosition("no")}
                    >
                      No
                    </button>
                  </div>
                ) : undefined
              }
              showExplainer={false}
            />
            {sortedActivePredictionMarkets.map((definition) => {
              const state = predictionStateByMarketId.get(definition.id);
              const userProfit = personalPredictionPnlByMarketId.get(definition.id);
              const clinchNote = predictionMarketClinchNote(definition.id);
              const inlineRules = predictionSportsbookButtonsOnly(definition.id);
              const rulesHelp = clinchNote ? (
                <PredictionMarketExplainer label="Clinch rules" text={clinchNote} />
              ) : null;
              const sportsbookOutcomes = winnerMarket
                ? [winnerPosition]
                : predictionMarketDisplayOutcomes(definition.id);
              const isCompleted = state !== undefined && state.market.status !== "open";
              if (isCompleted) {
                const resolvedOutcome = state.market.outcome ?? "no";
                const settlementPrice = state.market.settlementPriceCents;
                const invertChampionOutcome = winnerMarket && winnerPosition === "no";
                const displayedResolvedOutcome = invertChampionOutcome
                  ? resolvedOutcome === "yes"
                    ? "no"
                    : "yes"
                  : resolvedOutcome;
                const displayedSettlementPrice =
                  settlementPrice === null
                    ? null
                    : invertChampionOutcome
                      ? 100 - settlementPrice
                      : settlementPrice;
                return (
                  <article className="bettingPredictionBookResolvedRow" key={definition.id}>
                    <PredictionResolvedMarket
                      definition={definition}
                      density="compact"
                      displayedOutcome={displayedResolvedOutcome}
                      displayedSettlementPriceCents={displayedSettlementPrice}
                      pnl={userProfit}
                      state={state}
                    />
                  </article>
                );
              }
              return (
                <article
                  className={`bettingMarketCard${inlineRules ? " bettingMarketCard--inline-rules" : ""}`}
                  key={definition.id}
                >
                  {rulesHelp && !inlineRules ? (
                    <div className="predictionSharedStrikeHeading">
                      <PredictionMarketIdentity definition={definition} density="compact" />
                      {rulesHelp}
                    </div>
                  ) : null}
                  <div
                    className={`bettingOutcomes${
                      winnerMarket ? " bettingPredictionBookOutcome" : ""
                    }`}
                  >
                    {sportsbookOutcomes.map((entry) => {
                      const entryPrice = state?.book[entry].asks[0]?.priceCents;
                      const entrySelected =
                        predictionSelection?.marketId === definition.id &&
                        predictionSelection.outcome === entry;
                      const entryRestriction = predictionRestrictionFor(definition, entry);
                      const entryCountryCode = winnerMarket
                        ? definition.countryCode
                        : predictionOutcomeCountryCode(definition, entry);
                      const entryLabel = winnerMarket
                        ? definition.username
                        : predictionSportsbookOutcomeLabel(definition, entry);
                      return (
                        <button
                          type="button"
                          className={entrySelected ? "isSelected" : ""}
                          aria-pressed={entrySelected}
                          disabled={Boolean(entryRestriction) || entryPrice === undefined}
                          title={
                            restrictionTitle(entryRestriction) ??
                            (entryPrice === undefined && !activePredictionGroupLoading
                              ? "No liquidity is available."
                              : undefined)
                          }
                          onClick={() =>
                            choosePredictionOutcome(
                              definition.id,
                              entry,
                              suggestedPredictionPrice(definition, state, entry),
                            )
                          }
                          key={entry}
                        >
                          <span className="bettingOutcomePlayer">
                            <img
                              src={countryCodeToFlagUrl(entryCountryCode)}
                              alt=""
                              crossOrigin="anonymous"
                              loading="lazy"
                              decoding="async"
                              aria-hidden="true"
                            />
                            <span>{entryLabel}</span>
                          </span>
                          <span className="bettingOutcomeQuote">
                            <strong>{formatPredictionChance(entryPrice)}</strong>
                            {entryRestriction ? (
                              <small>Unavailable</small>
                            ) : activePredictionGroupLoading ? (
                              <small>Loading odds</small>
                            ) : entryPrice === undefined ? (
                              <small>No liquidity</small>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {inlineRules ? rulesHelp : null}
                  {isAuthenticated && state ? (
                    <PredictionMarketPnl value={userProfit} positions={state.positions} />
                  ) : null}
                </article>
              );
            })}
          </section>
        ) : null}
        {activePredictionGroup && groupHeader && !sportsbook ? (
          <section className="bettingExchangeGroup">
            <div
              className="bettingExchangeCard bettingExchangeCard--strikes"
              key={activePredictionGroup.id}
            >
              <PredictionMarketGroupHeader {...groupHeader} />
              <PredictionMarketTable
                activeMarketId={predictionSelection?.marketId}
                definitions={activePredictionGroup.markets}
                density="compact"
                expandedMarketId={expandedStrike?.marketId ?? null}
                expandedOutcome={expandedStrike?.outcome ?? "yes"}
                isAuthenticated={isAuthenticated}
                pnlByMarketId={personalPredictionPnlByMarketId}
                states={predictionStateByMarketId}
                selectedOutcome={predictionSelection?.outcome}
                onToggleMarket={(definition) => togglePredictionStrike(definition.id)}
                onSelectOutcome={(definition, outcome, suggestedPrice) =>
                  choosePredictionOutcome(definition.id, outcome, suggestedPrice)
                }
                outcomeAvailability={(definition, outcome) => {
                  const restriction = predictionRestrictionFor(definition, outcome);
                  return {
                    disabled: Boolean(restriction),
                    title: restrictionTitle(restriction),
                  };
                }}
                renderExpandedContent={(definition, state, outcome) => (
                  <PredictionOrderBook
                    asks={state.book[outcome].asks}
                    bids={state.book[outcome].bids}
                    density="compact"
                    headingLevel={2}
                    outcome={outcome}
                    outcomeName={predictionOutcomeLabel(definition, outcome)}
                    ownOrders={state.orders}
                    onEditOrders={(orders) =>
                      setEditingOrderContext({
                        marketId: definition.id,
                        outcome,
                        orderIds: orders.map((order) => order.id),
                      })
                    }
                    onSelect={(side, price, quantity) =>
                      startOrderFromBook(state, outcome, side, price, quantity)
                    }
                  />
                )}
              />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
};
