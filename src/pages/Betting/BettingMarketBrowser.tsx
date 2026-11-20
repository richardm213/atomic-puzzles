import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { InlineState } from "../../components/InlineState/InlineState";
import { PredictionMarketGroupHeader } from "../../components/PredictionTrading/PredictionMarketGroupHeader";
import { PredictionMarketPnl } from "../../components/PredictionTrading/PredictionMarketPnl";
import { PredictionMarketTable } from "../../components/PredictionTrading/PredictionMarketTable";
import { PredictionOrderBook } from "../../components/PredictionTrading/PredictionOrderBook";
import { PredictionResolvedMarket } from "../../components/PredictionTrading/PredictionResolvedMarket";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { formatCoinVolume } from "../../lib/coins/coinDisplay";
import {
  availablePredictionContracts,
  formatPredictionChance,
  type PredictionOutcome,
  predictionOutcomeCountryCode,
  predictionOutcomeLabel,
  predictionOutcomes,
  predictionSportsbookOutcomeLabel,
  suggestedPredictionPrice,
} from "../../lib/predictionMarkets/predictionMarkets";
import { appAssetPath } from "../../utils/appAssetPath";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { getErrorMessage } from "../../utils/errors";
import type { useBettingWorkspace } from "./useBettingWorkspace";
import { otherMarketCategories } from "./useBettingWorkspace";
import { isWinnerCategory } from "./useBettingWorkspace";
export const BettingMarketBrowser = ({
  marketCategories,
  marketCategory,
  selectMarketCategory,
  activePredictionGroup,
  predictionMarketOnlyCategory,
  predictionDisplayMode,
  setPredictionDisplayMode,
  setExpandedPredictionMarketId,
  setPredictionSelection,
  setSuccessMessage,
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
  predictionRestrictionTitle,
  choosePredictionOutcome,
  isAuthenticated,
  expandedPredictionMarketId,
  expandedPredictionOutcome,
  togglePredictionStrike,
  setEditingOrderContext,
  setPredictionQuantityInput,
}: ReturnType<typeof useBettingWorkspace>["browser"]) => (
  <div className="bettingMarketColumn">
    <div className="bettingCategories" aria-label="Market categories">
      {marketCategories
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
        data-active={otherMarketCategories.includes(marketCategory)}
        value={otherMarketCategories.includes(marketCategory) ? marketCategory : ""}
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
              aria-pressed={predictionDisplayMode === mode}
              onClick={() => {
                setPredictionDisplayMode(mode);
                setExpandedPredictionMarketId(null);
                setPredictionSelection(null);
                setSuccessMessage("");
              }}
              key={mode}
            >
              {predictionDisplayMode === mode ? (
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
      {activePredictionGroup && activePredictionDisplayMode === "book" ? (
        <section
          className={`bettingMarketGroup bettingPredictionBookGroup${
            activePredictionGroup.id === "awc-2026-round-of-16" ||
            activePredictionGroup.id === "awc-2026-quarterfinals" ||
            activePredictionGroup.id === "awc-2026-semifinals" ||
            activePredictionGroup.id === "awc-2026-losers-round-1" ||
            activePredictionGroup.id === "awc-2026-losers-round-2"
              ? " bettingPredictionBookGroup--singleColumn"
              : ""
          }`}
        >
          <PredictionMarketGroupHeader
            iconSrc={
              activePredictionGroup.id === "november-atomic-shield-2026"
                ? appAssetPath("/images/arenas/atomic-shield.png")
                : undefined
            }
            isLoading={activePredictionGroupLoading}
            isOpen={activePredictionGroupOpen}
            middle={
              isWinnerCategory(marketCategory) ? (
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
            path={activePredictionGroup.path}
            pnl={activePredictionGroupPnl}
            showExplainer={false}
            title={activePredictionGroup.title}
            volume={formatCoinVolume(activePredictionVolume)}
          />
          {sortedActivePredictionMarkets.map((definition) => {
            const state = predictionStateByMarketId.get(definition.id);
            const yesAsk = state?.book.yes.asks[0]?.priceCents;
            const noAsk = state?.book.no.asks[0]?.priceCents;
            const userProfit = personalPredictionPnlByMarketId.get(definition.id);
            const isCompleted = state !== undefined && state.market.status !== "open";
            if (isCompleted) {
              const resolvedOutcome = state.market.outcome ?? "no";
              const settlementPrice = state.market.settlementPriceCents;
              const invertChampionOutcome =
                isWinnerCategory(marketCategory) && winnerPosition === "no";
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
            const sportsbookOutcome: PredictionOutcome = isWinnerCategory(marketCategory)
              ? winnerPosition
              : "yes";
            const compactSportsbookCard =
              isWinnerCategory(marketCategory) || marketCategory === "Ban";
            const sportsbookOutcomes = compactSportsbookCard
              ? [sportsbookOutcome]
              : predictionOutcomes;
            return (
              <article className="bettingMarketCard" key={definition.id}>
                <div
                  className={`bettingOutcomes${
                    compactSportsbookCard ? " bettingPredictionBookOutcome" : ""
                  }`}
                >
                  {sportsbookOutcomes.map((entry) => {
                    const entryPrice = entry === "yes" ? yesAsk : noAsk;
                    const entrySuggestedPrice = suggestedPredictionPrice(definition, state, entry);
                    const entrySelected =
                      predictionSelection?.marketId === definition.id &&
                      predictionSelection.outcome === entry;
                    const entryRestriction = predictionRestrictionFor(
                      activePredictionGroup.id,
                      definition.username,
                      entry,
                    );
                    const entryCountryCode = compactSportsbookCard
                      ? definition.countryCode
                      : predictionOutcomeCountryCode(definition, entry);
                    const entryLabel = compactSportsbookCard
                      ? definition.username
                      : predictionSportsbookOutcomeLabel(definition, entry);
                    return (
                      <button
                        type="button"
                        className={entrySelected ? "isSelected" : ""}
                        aria-pressed={entrySelected}
                        disabled={Boolean(entryRestriction) || entryPrice === undefined}
                        title={
                          predictionRestrictionTitle(entryRestriction) ??
                          (entryPrice === undefined && !activePredictionGroupLoading
                            ? "No liquidity is available."
                            : undefined)
                        }
                        onClick={() =>
                          choosePredictionOutcome(definition.id, entry, entrySuggestedPrice)
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
                          ) : marketCategory === "Ban" ? (
                            <small>to be banned</small>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {isAuthenticated && state ? (
                  <PredictionMarketPnl value={userProfit} positions={state.positions} />
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
      {activePredictionGroup && activePredictionDisplayMode === "market" ? (
        <section className="bettingExchangeGroup">
          {[activePredictionGroup].map((group) => (
            <div className="bettingExchangeCard bettingExchangeCard--strikes" key={group.id}>
              <PredictionMarketGroupHeader
                iconSrc={
                  group.id === "november-atomic-shield-2026"
                    ? appAssetPath("/images/arenas/atomic-shield.png")
                    : undefined
                }
                isLoading={activePredictionGroupLoading}
                isOpen={activePredictionGroupOpen}
                path={group.path}
                pnl={activePredictionGroupPnl}
                title={group.title}
                volume={formatCoinVolume(activePredictionVolume)}
              />
              <PredictionMarketTable
                activeMarketId={predictionSelection?.marketId}
                definitions={group.markets}
                density="compact"
                expandedMarketId={expandedPredictionMarketId}
                expandedOutcome={expandedPredictionOutcome}
                isAuthenticated={isAuthenticated}
                pnlByMarketId={personalPredictionPnlByMarketId}
                states={predictionStateByMarketId}
                selectedOutcome={predictionSelection?.outcome}
                onToggleMarket={(definition) => togglePredictionStrike(definition.id)}
                onSelectOutcome={(definition, outcome, suggestedPrice) =>
                  choosePredictionOutcome(definition.id, outcome, suggestedPrice)
                }
                outcomeAvailability={(definition, outcome) => {
                  const restriction = predictionRestrictionFor(
                    group.id,
                    definition.username,
                    outcome,
                  );
                  return {
                    disabled: Boolean(restriction),
                    title: predictionRestrictionTitle(restriction),
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
                        orders,
                      })
                    }
                    onSelect={(side, priceCents, quantity) => {
                      const available = availablePredictionContracts(state.positions)[outcome];
                      const orderSide = side === "bid" && available >= 1 ? "sell" : "buy";
                      choosePredictionOutcome(definition.id, outcome, priceCents, orderSide);
                      setPredictionQuantityInput(
                        String(
                          orderSide === "sell"
                            ? Math.min(quantity, Math.floor(available))
                            : quantity,
                        ),
                      );
                    }}
                  />
                )}
              />
            </div>
          ))}
        </section>
      ) : null}
    </div>
  </div>
);
