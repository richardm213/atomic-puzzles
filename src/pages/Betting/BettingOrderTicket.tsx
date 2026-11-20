import type { FormEvent } from "react";

import { InlineState } from "../../components/InlineState/InlineState";
import { PredictionOrderComposer } from "../../components/PredictionTrading/PredictionOrderComposer";
import { usePredictionOrderSide } from "../../hooks/usePredictionOrderSide";
import {
  MAX_BET_STAKE,
  MIN_BET_AMOUNT,
  predictionOrderRestrictionMessage,
} from "../../lib/betting/betting";
import { formatCoinValue } from "../../lib/coins/coinDisplay";
import {
  isPredictionPrice,
  predictionOutcomeCountryCode,
  predictionSportsbookOutcomeLabel,
  predictionTakerFee,
  quotePredictionBuy,
  quotePredictionOrder,
  suggestedPredictionPrice,
} from "../../lib/predictionMarkets/predictionMarkets";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { getErrorMessage } from "../../utils/errors";
import type { useBettingWorkspace } from "./useBettingWorkspace";

export const BettingOrderTicket = ({
  auth: { username, isAuthenticated, authLoading, login },
  group,
  mode,
  winnerMarket,
  definition,
  state,
  selection,
  setOutcome,
  restrictionFor,
  balance,
  currentTime,
  betSlipRef,
  predictionStakeRef,
  side,
  setSide,
  priceInput,
  setPriceInput,
  quantityInput,
  setQuantityInput,
  stakeInput,
  setStakeInput,
  stakeTouched,
  setStakeTouched,
  mutation,
  successMessage,
  clearSuccess,
}: ReturnType<typeof useBettingWorkspace>["ticket"]) => {
  const sportsbook = mode === "book";
  const outcome = selection?.outcome ?? "yes";
  const book = state?.book[outcome];
  const price = sportsbook ? (book?.asks[0]?.priceCents ?? 0) : Number(priceInput);
  const validPrice = isPredictionPrice(price);
  const {
    availableByOutcome,
    availableContracts,
    canSell,
    hasSellInventory,
    quantity,
    validQuantity,
    selectOutcome,
    selectSide,
  } = usePredictionOrderSide({
    positions: state?.positions,
    isAuthenticated,
    side,
    outcome,
    quantityInput,
    onSideChange: setSide,
    onOutcomeChange: setOutcome,
    onQuantityChange: setQuantityInput,
    onSelectionChange: clearSuccess,
  });
  const orderQuote = quotePredictionOrder(book, side, price, validQuantity ? quantity : 0);

  const stake = Number(stakeInput);
  const stakeLimit = validPrice ? Math.min(MAX_BET_STAKE, price * 100) : MAX_BET_STAKE;
  const validStake = Number.isInteger(stake) && stake >= MIN_BET_AMOUNT && stake <= stakeLimit;
  const payout = validStake && validPrice ? Math.floor((stake * 100) / price) : 0;
  const quote = quotePredictionBuy(book?.asks ?? [], validPrice ? price : 0, payout);
  const fee = predictionTakerFee(quote.fillCostCoins);
  const cost = quote.fillCostCoins + fee;
  const fills = payout > 0 && quote.restingQuantity === 0;
  const insufficientBalance = isAuthenticated && cost > balance;
  const restriction = definition && restrictionFor(definition, outcome, sportsbook ? "buy" : side);
  const closesAt = Date.parse(state?.market.closesAt ?? "");
  const open = state?.market.status === "open" && closesAt > currentTime;
  const canSubmit =
    isAuthenticated &&
    open &&
    validPrice &&
    !restriction &&
    !mutation.isPending &&
    (sportsbook ? fills && !insufficientBalance : validQuantity && hasSellInventory);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearSuccess();
    if (sportsbook) setStakeTouched(true);
    if (!selection || !canSubmit || closesAt <= Date.now()) return;

    mutation.mutate({
      username,
      ...selection,
      side: sportsbook ? "buy" : side,
      priceCents: price,
      quantity: sportsbook ? payout : quantity,
      ...(sportsbook ? { budgetCoins: stake } : {}),
    });
  };

  const originalOrder = mutation.variables;
  const canRetry = isAuthenticated && !mutation.isPending && originalOrder?.username === username;
  const submitLabel = sportsbook
    ? fills
      ? `Place bet · ${formatCoinValue(cost)} coins`
      : "Place bet"
    : `${side === "sell" ? "Sell" : orderQuote.action} ${outcome === "yes" ? "Yes" : "No"} · ${validPrice ? `${price}¢` : "—"}`;

  return (
    <aside
      className={`betSlip${group && !sportsbook ? " betSlip--predictionOrder" : ""}`}
      aria-labelledby="bet-slip-title"
      ref={betSlipRef}
    >
      <h2
        id="bet-slip-title"
        className={group && !sportsbook ? "betSlipVisuallyHiddenTitle" : undefined}
      >
        {group && sportsbook ? "Sportsbook bet" : "Bet slip"}
      </h2>
      {group ? (
        definition && selection ? (
          <form onSubmit={submit}>
            {sportsbook ? (
              <div className="betSlipSelection">
                <small>{group.title}</small>
                <div className="betSlipContract">
                  <span>
                    <img
                      src={countryCodeToFlagUrl(predictionOutcomeCountryCode(definition, outcome))}
                      alt=""
                      crossOrigin="anonymous"
                      aria-hidden="true"
                    />
                    <strong>{predictionSportsbookOutcomeLabel(definition, outcome)}</strong>
                    {winnerMarket || definition.outcomeLabels ? (
                      <em>
                        {definition.outcomeLabels || outcome === "yes" ? "to win" : "not to win"}
                      </em>
                    ) : null}
                  </span>
                  <b>{validPrice ? `${price}%` : "—"}</b>
                </div>
              </div>
            ) : null}
            {sportsbook ? (
              <>
                <label htmlFor="prediction-sportsbook-stake">Bet amount</label>
                <div className="betAmountField">
                  <input
                    ref={predictionStakeRef}
                    id="prediction-sportsbook-stake"
                    type="number"
                    inputMode="numeric"
                    min={MIN_BET_AMOUNT}
                    max={stakeLimit}
                    step="1"
                    placeholder="0"
                    value={stakeInput}
                    onChange={(event) => {
                      setStakeInput(event.target.value);
                      setStakeTouched(true);
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
                      {quote.averageFillPriceCents === undefined
                        ? "—"
                        : `${quote.averageFillPriceCents.toFixed(1)}¢`}
                    </dd>
                  </div>
                  <div>
                    <dt>Payout if correct</dt>
                    <dd>{payout > 0 ? `${payout.toLocaleString()} coins` : "—"}</dd>
                  </div>
                  <div className="betQuoteTotal">
                    <dt>Total cost</dt>
                    <dd>{fills ? `${formatCoinValue(cost)} coins` : "—"}</dd>
                  </div>
                  <div className="betQuoteFee">
                    <dt>Includes 2% fee</dt>
                    <dd>{fills ? `${formatCoinValue(fee)} coins` : "—"}</dd>
                  </div>
                </dl>
                {stakeTouched && !validStake ? (
                  <InlineState kind="error">
                    {`Enter a whole coin amount from ${MIN_BET_AMOUNT} to ${stakeLimit}.`}
                  </InlineState>
                ) : null}
                {validStake && payout === 0 ? (
                  <InlineState kind="error">
                    Increase the bet amount to buy at least one contract.
                  </InlineState>
                ) : null}
                {validStake && payout > 0 && !fills ? (
                  <InlineState kind="error">
                    {`Only ${quote.fillCostCoins.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} coins are available at this price.`}
                  </InlineState>
                ) : null}
                {insufficientBalance ? (
                  <InlineState kind="error">
                    You need {formatCoinValue(cost)} coins including the fee.
                  </InlineState>
                ) : null}
              </>
            ) : (
              <PredictionOrderComposer
                definition={definition}
                density="compact"
                idPrefix="prediction-betting-order"
                outcome={outcome}
                side={side}
                showSell={canSell}
                onSideChange={selectSide}
                outcomeDisabled={(entry) =>
                  (side === "sell" && availableByOutcome[entry] < 1) ||
                  Boolean(restrictionFor(definition, entry, side))
                }
                outcomePrices={{
                  yes: state?.book.yes.asks[0]?.priceCents,
                  no: state?.book.no.asks[0]?.priceCents,
                }}
                quantityInput={quantityInput}
                priceInput={priceInput}
                primaryLabel={side === "sell" ? "Proceeds" : "Cost"}
                primaryValue={
                  validPrice && validQuantity ? `${formatCoinValue(orderQuote.total)} coins` : "—"
                }
                secondaryLabel={side === "sell" ? "Available contracts" : "Max payout"}
                secondaryValue={
                  side === "sell"
                    ? availableContracts.toLocaleString()
                    : validQuantity
                      ? `${quantity.toLocaleString()} coins`
                      : "—"
                }
                secondaryNote={
                  side === "buy" && validPrice && validQuantity ? (
                    <span className={orderQuote.profit >= 0 ? "isPositive" : "isNegative"}>
                      {orderQuote.profit >= 0 ? "+" : ""}
                      {formatCoinValue(orderQuote.profit)} coins
                    </span>
                  ) : undefined
                }
                onOutcomeChange={(entry) => {
                  selectOutcome(entry);
                  setPriceInput(
                    String(
                      side === "sell"
                        ? (state?.book[entry].bids[0]?.priceCents ?? price)
                        : suggestedPredictionPrice(definition, state, entry),
                    ),
                  );
                }}
                onQuantityChange={setQuantityInput}
                onPriceChange={setPriceInput}
              />
            )}
            {mutation.error ? (
              <InlineState kind="error">
                {getErrorMessage(mutation.error, "Unable to place this order.")}
                <button
                  type="button"
                  disabled={!canRetry}
                  onClick={() => {
                    if (canRetry && originalOrder) mutation.mutate(originalOrder);
                  }}
                >
                  Retry original order
                </button>
              </InlineState>
            ) : null}
            {restriction ? (
              <InlineState kind="error">
                {predictionOrderRestrictionMessage(restriction, group.id)}
              </InlineState>
            ) : null}
            {successMessage ? <InlineState kind="success">{successMessage}</InlineState> : null}
            {isAuthenticated ? (
              <button className="betSubmitButton" type="submit" disabled={!canSubmit}>
                {mutation.isPending
                  ? sportsbook
                    ? "Placing bet…"
                    : "Placing order…"
                  : submitLabel}
              </button>
            ) : (
              <button
                className="betSubmitButton"
                type="button"
                disabled={authLoading}
                onClick={() => void login("/betting")}
              >
                {sportsbook ? "Log in to bet" : "Log in to trade"}
              </button>
            )}
          </form>
        ) : (
          <p className="betSlipEmpty">
            {sportsbook
              ? "Choose an outcome to add it to the bet slip."
              : "Choose Yes or No beside a player to start an order."}
          </p>
        )
      ) : null}
    </aside>
  );
};
