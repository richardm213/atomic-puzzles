import { InlineState } from "../../components/InlineState/InlineState";
import { PredictionOrderComposer } from "../../components/PredictionTrading/PredictionOrderComposer";
import { MIN_BET_AMOUNT, predictionOrderRestrictionMessage } from "../../lib/betting/betting";
import { formatCoinValue } from "../../lib/coins/coinDisplay";
import {
  predictionOutcomeCountryCode,
  predictionSportsbookOutcomeLabel,
  suggestedPredictionPrice,
} from "../../lib/predictionMarkets/predictionMarkets";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { getErrorMessage } from "../../utils/errors";
import type { useBettingWorkspace } from "./useBettingWorkspace";
import { isWinnerCategory } from "./useBettingWorkspace";
export const BettingOrderTicket = ({
  activePredictionGroup,
  activePredictionDisplayMode,
  betSlipRef,
  selectedPredictionDefinition,
  predictionSelection,
  submitPredictionSportsbookBet,
  submitPredictionOrder,
  selectedPredictionGroup,
  marketCategory,
  validPredictionPrice,
  predictionPrice,
  predictionStakeRef,
  predictionSportsbookStakeLimit,
  predictionStakeInput,
  setPredictionStakeInput,
  setPredictionStakeTouched,
  predictionSportsbookQuote,
  predictionSportsbookQuantity,
  validPredictionStake,
  predictionSportsbookFullyMatched,
  predictionSportsbookTotal,
  predictionSportsbookFee,
  predictionStakeTouched,
  predictionSportsbookInsufficientBalance,
  predictionSide,
  canSell,
  selectPredictionSide,
  availableContracts,
  predictionRestrictionFor,
  selectedPredictionState,
  predictionQuantityInput,
  predictionPriceInput,
  validPredictionQuantity,
  predictionSellProceeds,
  predictionEstimatedTotal,
  selectedPredictionOutcome,
  predictionQuantity,
  predictionEstimatedProfit,
  selectPredictionOutcome,
  setPredictionPriceInput,
  setPredictionQuantityInput,
  placePredictionMutation,
  username,
  selectedPredictionRestriction,
  successMessage,
  isAuthenticated,
  selectedPredictionOpen,
  authLoading,
  login,
  hasSellInventory,
  predictionBuyQuote,
}: ReturnType<typeof useBettingWorkspace>["ticket"]) => (
  <aside
    className={`betSlip${
      activePredictionGroup && activePredictionDisplayMode === "market"
        ? " betSlip--predictionOrder"
        : ""
    }`}
    aria-labelledby="bet-slip-title"
    ref={betSlipRef}
  >
    <h2
      id="bet-slip-title"
      className={
        activePredictionGroup && activePredictionDisplayMode === "market"
          ? "betSlipVisuallyHiddenTitle"
          : undefined
      }
    >
      {activePredictionGroup && activePredictionDisplayMode === "book"
        ? "Sportsbook bet"
        : "Bet slip"}
    </h2>
    {activePredictionGroup ? (
      selectedPredictionDefinition && predictionSelection ? (
        <form
          onSubmit={
            activePredictionDisplayMode === "book"
              ? submitPredictionSportsbookBet
              : submitPredictionOrder
          }
        >
          {activePredictionDisplayMode === "book" ? (
            <div className="betSlipSelection">
              <small>{selectedPredictionGroup?.title ?? "Prediction market"}</small>
              <div className="betSlipContract">
                <span>
                  <img
                    src={countryCodeToFlagUrl(
                      predictionOutcomeCountryCode(
                        selectedPredictionDefinition,
                        predictionSelection.outcome,
                      ),
                    )}
                    alt=""
                    crossOrigin="anonymous"
                    aria-hidden="true"
                  />
                  <strong>
                    {predictionSportsbookOutcomeLabel(
                      selectedPredictionDefinition,
                      predictionSelection.outcome,
                    )}
                  </strong>
                  {marketCategory === "Ban" ||
                  isWinnerCategory(marketCategory) ||
                  selectedPredictionDefinition?.outcomeLabels ? (
                    <em>
                      {selectedPredictionGroup?.id === "ban-2026"
                        ? predictionSelection.outcome === "yes"
                          ? "banned"
                          : "not banned"
                        : selectedPredictionDefinition?.outcomeLabels ||
                            predictionSelection.outcome === "yes"
                          ? "to win"
                          : "not to win"}
                    </em>
                  ) : null}
                </span>
                <b>{validPredictionPrice ? `${predictionPrice}%` : "—"}</b>
              </div>
            </div>
          ) : null}
          {activePredictionDisplayMode === "book" ? (
            <>
              <label htmlFor="prediction-sportsbook-stake">Bet amount</label>
              <div className="betAmountField">
                <input
                  ref={predictionStakeRef}
                  id="prediction-sportsbook-stake"
                  type="number"
                  inputMode="numeric"
                  min={MIN_BET_AMOUNT}
                  max={predictionSportsbookStakeLimit}
                  step="1"
                  placeholder="0"
                  value={predictionStakeInput}
                  onChange={(event) => {
                    setPredictionStakeInput(event.target.value);
                    setPredictionStakeTouched(true);
                  }}
                  aria-describedby="prediction-sportsbook-help"
                />
                <span>coins</span>
              </div>
              <small id="prediction-sportsbook-help" className="betSlipHelp">
                Your bet fills immediately at the displayed price. A 2% taker fee applies.
              </small>
              <dl className="betQuote">
                <div>
                  <dt>Average price</dt>
                  <dd>
                    {predictionSportsbookQuote.averageFillPriceCents === undefined
                      ? "—"
                      : `${predictionSportsbookQuote.averageFillPriceCents.toFixed(1)}¢`}
                  </dd>
                </div>
                <div>
                  <dt>Payout if correct</dt>
                  <dd>
                    {predictionSportsbookQuantity > 0
                      ? `${predictionSportsbookQuantity.toLocaleString()} coins`
                      : "—"}
                  </dd>
                </div>
                <div className="betQuoteTotal">
                  <dt>Total cost</dt>
                  <dd>
                    {validPredictionStake && predictionSportsbookFullyMatched
                      ? `${formatCoinValue(predictionSportsbookTotal)} coins`
                      : "—"}
                  </dd>
                </div>
                <div className="betQuoteFee">
                  <dt>Includes 2% fee</dt>
                  <dd>
                    {validPredictionStake && predictionSportsbookFullyMatched
                      ? `${formatCoinValue(predictionSportsbookFee)} coins`
                      : "—"}
                  </dd>
                </div>
              </dl>
              {predictionStakeTouched && !validPredictionStake ? (
                <InlineState kind="error">
                  {`Enter a whole coin amount from ${MIN_BET_AMOUNT} to ${predictionSportsbookStakeLimit}.`}
                </InlineState>
              ) : null}
              {validPredictionStake && predictionSportsbookQuantity === 0 ? (
                <InlineState kind="error">
                  Increase the bet amount to buy at least one contract.
                </InlineState>
              ) : null}
              {validPredictionStake &&
              predictionSportsbookQuantity > 0 &&
              !predictionSportsbookFullyMatched ? (
                <InlineState kind="error">
                  {`Only ${predictionSportsbookQuote.fillCostCoins.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })} coins are available at this price.`}
                </InlineState>
              ) : null}
              {predictionSportsbookInsufficientBalance ? (
                <InlineState kind="error">
                  You need {formatCoinValue(predictionSportsbookTotal)} coins including the fee.
                </InlineState>
              ) : null}
            </>
          ) : (
            <PredictionOrderComposer
              definition={selectedPredictionDefinition}
              density="compact"
              idPrefix="prediction-betting-order"
              outcome={predictionSelection.outcome}
              side={predictionSide}
              showSell={canSell}
              onSideChange={selectPredictionSide}
              outcomeDisabled={(entry) =>
                (predictionSide === "sell" && availableContracts[entry] < 1) ||
                Boolean(
                  predictionRestrictionFor(
                    selectedPredictionGroup?.id,
                    selectedPredictionDefinition.username,
                    entry,
                    predictionSide,
                  ),
                )
              }
              outcomePrices={{
                yes: selectedPredictionState?.book.yes.asks[0]?.priceCents,
                no: selectedPredictionState?.book.no.asks[0]?.priceCents,
              }}
              quantityInput={predictionQuantityInput}
              priceInput={predictionPriceInput}
              primaryLabel={predictionSide === "sell" ? "Proceeds" : "Cost"}
              primaryValue={
                validPredictionPrice && validPredictionQuantity
                  ? `${formatCoinValue(predictionSide === "sell" ? predictionSellProceeds : predictionEstimatedTotal)} coins`
                  : "—"
              }
              secondaryLabel={predictionSide === "sell" ? "Available contracts" : "Max payout"}
              secondaryValue={
                predictionSide === "sell"
                  ? availableContracts[selectedPredictionOutcome].toLocaleString()
                  : validPredictionQuantity
                    ? `${predictionQuantity.toLocaleString()} coins`
                    : "—"
              }
              secondaryNote={
                predictionSide === "buy" && validPredictionPrice && validPredictionQuantity ? (
                  <span className={predictionEstimatedProfit >= 0 ? "isPositive" : "isNegative"}>
                    {predictionEstimatedProfit >= 0 ? "+" : ""}
                    {formatCoinValue(predictionEstimatedProfit)} coins
                  </span>
                ) : undefined
              }
              onOutcomeChange={(entry) => {
                selectPredictionOutcome(entry);
                setPredictionPriceInput(
                  String(
                    predictionSide === "sell"
                      ? (selectedPredictionState?.book[entry].bids[0]?.priceCents ??
                          predictionPrice)
                      : suggestedPredictionPrice(
                          selectedPredictionDefinition,
                          selectedPredictionState,
                          entry,
                        ),
                  ),
                );
              }}
              onQuantityChange={setPredictionQuantityInput}
              onPriceChange={setPredictionPriceInput}
            />
          )}
          {placePredictionMutation.error ? (
            <InlineState kind="error">
              {getErrorMessage(placePredictionMutation.error, "Unable to place this order.")}
              <button
                type="button"
                disabled={placePredictionMutation.variables?.username !== username}
                onClick={() => {
                  if (placePredictionMutation.variables)
                    placePredictionMutation.mutate(placePredictionMutation.variables);
                }}
              >
                Retry original order
              </button>
            </InlineState>
          ) : null}
          {selectedPredictionRestriction ? (
            <InlineState kind="error">
              {predictionOrderRestrictionMessage(selectedPredictionRestriction)}
            </InlineState>
          ) : null}
          {successMessage ? <InlineState kind="success">{successMessage}</InlineState> : null}
          {activePredictionDisplayMode === "book" ? (
            isAuthenticated ? (
              <button
                className="betSubmitButton"
                type="submit"
                disabled={
                  !validPredictionPrice ||
                  !validPredictionStake ||
                  !predictionSportsbookFullyMatched ||
                  predictionSportsbookInsufficientBalance ||
                  Boolean(selectedPredictionRestriction) ||
                  !selectedPredictionOpen ||
                  placePredictionMutation.isPending
                }
              >
                {placePredictionMutation.isPending
                  ? "Placing bet…"
                  : validPredictionStake && predictionSportsbookFullyMatched
                    ? `Place bet · ${formatCoinValue(predictionSportsbookTotal)} coins`
                    : "Place bet"}
              </button>
            ) : (
              <button
                className="betSubmitButton"
                type="button"
                disabled={authLoading}
                onClick={() => void login("/betting")}
              >
                Log in to bet
              </button>
            )
          ) : isAuthenticated ? (
            <button
              className="betSubmitButton"
              type="submit"
              disabled={
                !validPredictionPrice ||
                !validPredictionQuantity ||
                !hasSellInventory ||
                Boolean(selectedPredictionRestriction) ||
                !selectedPredictionOpen ||
                placePredictionMutation.isPending
              }
            >
              {placePredictionMutation.isPending
                ? "Placing order…"
                : `${predictionSide === "sell" ? "Sell" : predictionBuyQuote.filledQuantity > 0 ? "Buy" : "Bid"} ${selectedPredictionOutcome === "yes" ? "Yes" : "No"} · ${validPredictionPrice ? `${predictionPrice}¢` : "—"}`}
            </button>
          ) : (
            <button
              className="betSubmitButton"
              type="button"
              disabled={authLoading}
              onClick={() => void login("/betting")}
            >
              Log in to trade
            </button>
          )}
        </form>
      ) : (
        <p className="betSlipEmpty">
          {activePredictionDisplayMode === "book"
            ? "Choose an outcome to add it to the bet slip."
            : "Choose Yes or No beside a player to start an order."}
        </p>
      )
    ) : null}
  </aside>
);
