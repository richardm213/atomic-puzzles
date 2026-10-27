import "./PredictionMarket.css";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import type { CSSProperties, FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { InlineState } from "../../components/InlineState/InlineState";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { formatCoinBalance } from "../../lib/coins/coinDisplay";
import { coinQueryKeys, coinSummaryQueryOptions } from "../../lib/coins/coinQueries";
import {
  predictionMarketQueryOptions,
  predictionMarketQueryRoot,
} from "../../lib/predictionMarkets/predictionMarketQueries";
import {
  cancelPredictionOrder,
  placePredictionOrder,
  PREDICTION_MARKET_GROUPS,
  type PredictionMarketDefinition,
  type PredictionMarketId,
  type PredictionOrderSide,
  type PredictionOutcome,
} from "../../lib/predictionMarkets/predictionMarkets";
import { appAssetPath } from "../../utils/appAssetPath";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { formatLocalDateTime } from "../../utils/formatters";

const outcomeLabel = (outcome: PredictionOutcome) => (outcome === "yes" ? "Yes" : "No");
const money = (cents: number) => `${cents} cents`;
const averagePrice = (cents: number | undefined) => {
  if (cents === undefined) return "—";
  return `${Number.isInteger(cents) ? cents.toFixed(0) : cents.toFixed(1)}¢`;
};
const Price = ({ cents }: { cents: number }) => (
  <span className="predictionPrice" aria-label={`${cents} cents`}>
    <span aria-hidden="true">{cents}</span>
    <span className="predictionPriceCent" aria-hidden="true">
      ¢
    </span>
  </span>
);

export const PredictionMarketPage = () => {
  const { isAuthenticated, isLoading: authLoading, login, user } = useAuth();
  const queryClient = useQueryClient();
  const username = user?.username ?? "anonymous";
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const marketGroup =
    PREDICTION_MARKET_GROUPS.find((group) => group.path === pathname) ??
    PREDICTION_MARKET_GROUPS[0];
  const marketDefinitions: readonly PredictionMarketDefinition[] = marketGroup.markets;
  const [activeMarketId, setActiveMarketId] = useState<PredictionMarketId>(
    marketDefinitions[0]!.id,
  );
  const [expandedMarketId, setExpandedMarketId] = useState<PredictionMarketId | null>(
    marketDefinitions[0]!.id,
  );
  const marketQueries = useQueries({
    queries: marketDefinitions.map((market) => predictionMarketQueryOptions(market.id)),
  });
  const activeMarketIndex = marketDefinitions.findIndex((market) => market.id === activeMarketId);
  const marketQuery = marketQueries[activeMarketIndex] ?? marketQueries[0]!;
  const coinQuery = useQuery({
    ...coinSummaryQueryOptions(username),
    enabled: isAuthenticated,
  });
  const [outcome, setOutcome] = useState<PredictionOutcome>("yes");
  const [side, setSide] = useState<PredictionOrderSide>("buy");
  const [priceInput, setPriceInput] = useState("50");
  const [quantityInput, setQuantityInput] = useState("10");
  const [successMessage, setSuccessMessage] = useState("");
  const marketVolume = marketQueries.reduce(
    (groupTotal, query) =>
      groupTotal +
      (query.data?.fills.reduce(
        (marketTotal, fill) => marketTotal + (fill.priceCents * fill.quantity) / 100,
        0,
      ) ?? 0),
    0,
  );

  useEffect(() => {
    const firstMarketId = marketDefinitions[0]!.id;
    setActiveMarketId(firstMarketId);
    setExpandedMarketId(firstMarketId);
    setOutcome("yes");
    setSuccessMessage("");
  }, [marketDefinitions]);

  const marketState = marketQuery.data;
  const price = Number(priceInput);
  const quantity = Number(quantityInput);
  const validPrice = Number.isInteger(price) && price >= 1 && price <= 99;
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 10_000;
  const orderValue = validPrice && validQuantity ? (price * quantity) / 100 : 0;
  const immediatelyAvailable =
    validPrice && marketState
      ? marketState.book[outcome].asks
          .filter((level) => level.priceCents <= price)
          .reduce((total, level) => total + level.quantity, 0)
      : 0;
  const immediateBuyQuantity = validQuantity ? Math.min(quantity, immediatelyAvailable) : 0;
  const restingBidQuantity = validQuantity ? Math.max(0, quantity - immediateBuyQuantity) : 0;
  const buyAction =
    immediateBuyQuantity === 0
      ? "Place bid"
      : restingBidQuantity === 0
        ? "Buy now"
        : "Buy now + place bid";
  const buyExecution =
    !validPrice || !validQuantity
      ? "—"
      : immediateBuyQuantity === 0
        ? `${quantity.toLocaleString()} ${quantity === 1 ? "contract" : "contracts"} posted as a bid`
        : restingBidQuantity === 0
          ? `${quantity.toLocaleString()} ${quantity === 1 ? "contract" : "contracts"} bought immediately`
          : `${immediateBuyQuantity.toLocaleString()} buy now · ${restingBidQuantity.toLocaleString()} posted as a bid`;
  const positionsByOutcome = {
    yes: marketState?.positions.find((entry) => entry.outcome === "yes"),
    no: marketState?.positions.find((entry) => entry.outcome === "no"),
  };
  const ownedByOutcome = {
    yes: positionsByOutcome.yes?.quantity ?? 0,
    no: positionsByOutcome.no?.quantity ?? 0,
  } satisfies Record<PredictionOutcome, number>;
  const availableByOutcome = {
    yes: ownedByOutcome.yes - (positionsByOutcome.yes?.reservedQuantity ?? 0),
    no: ownedByOutcome.no - (positionsByOutcome.no?.reservedQuantity ?? 0),
  } satisfies Record<PredictionOutcome, number>;
  const availableContracts = availableByOutcome[outcome];
  const ownsAnyContracts = availableByOutcome.yes > 0 || availableByOutcome.no > 0;
  const hasSellInventory =
    side === "buy" ||
    (isAuthenticated && validQuantity && quantity <= availableContracts && availableContracts > 0);
  const marketOpen =
    marketState?.market.status === "open" && Date.parse(marketState.market.closesAt) > Date.now();

  const askPrices = useMemo(() => {
    if (!marketState) return { yes: undefined, no: undefined };
    return {
      yes: marketState.book.yes.asks[0]?.priceCents,
      no: marketState.book.no.asks[0]?.priceCents,
    };
  }, [marketState]);
  const activeMarketDefinition = marketDefinitions[activeMarketIndex] ?? marketDefinitions[0]!;
  const recentFills = marketDefinitions
    .flatMap((definition, index) =>
      (marketQueries[index]?.data?.fills ?? []).map((fill) => ({ ...fill, definition })),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id - left.id)
    .slice(0, 20);

  const refreshMarket = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: predictionMarketQueryRoot }),
      queryClient.invalidateQueries({ queryKey: coinQueryKeys.summary(username) }),
    ]);
  };

  const placeMutation = useMutation({
    mutationFn: placePredictionOrder,
    onSuccess: async () => {
      setSuccessMessage(`${side === "buy" ? "Bid" : "Ask"} placed.`);
      await refreshMarket();
    },
  });
  const cancelMutation = useMutation({
    mutationFn: (orderId: number) => cancelPredictionOrder(activeMarketId, orderId),
    onSuccess: refreshMarket,
  });

  const submitOrder = (event: FormEvent) => {
    event.preventDefault();
    setSuccessMessage("");
    if (!validPrice || !validQuantity || !hasSellInventory || !marketOpen) return;
    placeMutation.mutate({
      marketId: activeMarketId,
      outcome,
      side,
      priceCents: price,
      quantity,
    });
  };

  const selectSide = (nextSide: PredictionOrderSide) => {
    setSide(nextSide);
    setSuccessMessage("");
    if (nextSide !== "sell" || availableByOutcome[outcome] > 0) return;
    if (availableByOutcome.yes > 0) setOutcome("yes");
    else if (availableByOutcome.no > 0) setOutcome("no");
  };

  const startOrderFromBook = (
    nextSide: PredictionOrderSide,
    nextPrice: number,
    nextQuantity: number,
  ) => {
    setSide(nextSide);
    setPriceInput(String(nextPrice));
    setQuantityInput(String(nextQuantity));
    setSuccessMessage("");
    placeMutation.reset();
  };

  const toggleMarket = (marketId: PredictionMarketId) => {
    setActiveMarketId(marketId);
    setExpandedMarketId((current) => (current === marketId ? null : marketId));
    setSuccessMessage("");
  };

  const activeMarketPanel = marketState ? (
    <div className="predictionStrikeDrawer" id={`prediction-strike-${activeMarketDefinition.id}`}>
      <section className="predictionBookPanel" aria-labelledby="order-book-title">
        <div className="predictionSectionHeader">
          <h2 id="order-book-title">Order book</h2>
          <span>
            {activeMarketDefinition.username} · {outcomeLabel(outcome)} · all traders
          </span>
        </div>
        <VerticalOrderBook
          bids={marketState.book[outcome].bids}
          asks={marketState.book[outcome].asks}
          onSelectBid={(nextPrice, nextQuantity) =>
            startOrderFromBook("sell", nextPrice, nextQuantity)
          }
          onSelectAsk={(nextPrice, nextQuantity) =>
            startOrderFromBook("buy", nextPrice, nextQuantity)
          }
        />
      </section>
      <aside className="predictionTicket" aria-labelledby="order-ticket-title">
        <h2 id="order-ticket-title">Order ticket</h2>
        <div className="predictionTicketTabs" role="group" aria-label="Order side">
          {(["buy", "sell"] as const).map((entry) => (
            <button
              type="button"
              aria-pressed={side === entry}
              disabled={entry === "sell" && isAuthenticated && !ownsAnyContracts}
              title={
                entry === "sell" && isAuthenticated && !ownsAnyContracts
                  ? "You do not own any available contracts to sell."
                  : undefined
              }
              onClick={() => selectSide(entry)}
              key={entry}
            >
              {entry === "buy" ? "Buy" : "Sell"}
            </button>
          ))}
        </div>
        <div className="predictionTicketMarket">
          <img
            className="predictionOutcomeFlag"
            crossOrigin="anonymous"
            src={countryCodeToFlagUrl(activeMarketDefinition.countryCode)}
            alt=""
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
          <strong>{activeMarketDefinition.username}</strong>
        </div>
        <form onSubmit={submitOrder}>
          <div
            className={`predictionOutcomePicker predictionOutcomePicker--${side}`}
            role="group"
            aria-label="Outcome"
          >
            {(["yes", "no"] as const).map((entry) => (
              <button
                type="button"
                aria-pressed={outcome === entry}
                disabled={side === "sell" && availableByOutcome[entry] <= 0}
                onClick={() => setOutcome(entry)}
                key={entry}
              >
                <span className="predictionOutcomePrimary">
                  <span>
                    {side === "buy" ? "Buy" : "Sell"} {outcomeLabel(entry)}
                  </span>
                  {askPrices[entry] === undefined ? null : (
                    <strong>
                      <Price cents={askPrices[entry]} />
                    </strong>
                  )}
                </span>
              </button>
            ))}
          </div>
          <label>
            Limit price
            <span className="predictionInputSuffix">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                max="99"
                step="1"
                value={priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
              />
              <span>¢</span>
            </span>
          </label>
          <div className="predictionQuantityField">
            <div className="predictionQuantityLabel">
              <label htmlFor="prediction-contract-quantity">Contracts</label>
              {side === "sell" && availableContracts > 0 ? (
                <button type="button" onClick={() => setQuantityInput(String(availableContracts))}>
                  Sell max
                </button>
              ) : null}
            </div>
            <input
              id="prediction-contract-quantity"
              type="number"
              inputMode="numeric"
              min="1"
              max="10000"
              step="1"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
            />
          </div>
          <dl className="predictionOrderMath">
            {side === "buy" ? (
              <div>
                <dt>Execution</dt>
                <dd
                  className={
                    immediateBuyQuantity === 0
                      ? "predictionExecution predictionExecution--bid"
                      : restingBidQuantity === 0
                        ? "predictionExecution predictionExecution--immediate"
                        : "predictionExecution predictionExecution--mixed"
                  }
                >
                  {buyExecution}
                </dd>
              </div>
            ) : null}
            <div>
              <dt>{side === "buy" ? "Maximum cost" : "Sale value"}</dt>
              <dd>{orderValue.toFixed(2)} coins</dd>
            </div>
            <div>
              <dt>{side === "buy" ? "Potential payout" : "Contracts offered"}</dt>
              <dd>
                {validQuantity ? quantity.toLocaleString() : "—"}
                {side === "buy" ? " coins" : ""}
              </dd>
            </div>
          </dl>
          {side === "sell" ? (
            <div className="predictionInventory">
              <strong>
                {availableContracts.toLocaleString()} {outcomeLabel(outcome)} contracts available
              </strong>
              <small>Selling uses contracts you own. It does not spend coins.</small>
            </div>
          ) : null}
          {!hasSellInventory ? (
            <InlineState kind="error">You don’t have enough available contracts.</InlineState>
          ) : null}
          {placeMutation.error ? (
            <InlineState kind="error">
              {placeMutation.error instanceof Error
                ? placeMutation.error.message
                : "Unable to place this order."}
            </InlineState>
          ) : null}
          {successMessage ? <InlineState kind="success">{successMessage}</InlineState> : null}
          {isAuthenticated ? (
            <button
              className="predictionSubmit"
              type="submit"
              disabled={
                !validPrice ||
                !validQuantity ||
                !hasSellInventory ||
                !marketOpen ||
                placeMutation.isPending
              }
            >
              {placeMutation.isPending ? (
                "Placing order…"
              ) : (
                <>
                  {side === "buy" ? buyAction : "Place ask"} · {outcomeLabel(outcome)}{" "}
                  <Price cents={validPrice ? price : 0} />
                </>
              )}
            </button>
          ) : (
            <button
              className="predictionSubmit"
              type="button"
              disabled={authLoading}
              onClick={() => void login(marketGroup.path)}
            >
              Log in to trade
            </button>
          )}
        </form>
      </aside>
    </div>
  ) : null;

  if (marketQueries.every((query) => query.isPending && !query.data))
    return <RouteLoadingFallback />;

  return (
    <main className="sitePage predictionMarketPage">
      <Seo
        title={marketGroup.title}
        description={marketGroup.description}
        path={marketGroup.path}
      />
      <section className="predictionMarketShell">
        <header className="predictionMarketHeader">
          <div>
            <Link to="/betting">← All markets</Link>
            <h1>{marketGroup.title}</h1>
            <div className="predictionMarketMeta">
              <span
                className={`predictionStatus predictionStatus--${marketOpen ? "open" : "closed"}`}
              >
                {marketOpen ? "Trading" : "Closed"}
              </span>
              {marketState ? (
                <span>Closes {formatLocalDateTime(marketState.market.closesAt)}</span>
              ) : null}
              <span>Volume {formatCoinBalance(marketVolume)} coins</span>
            </div>
          </div>
          {isAuthenticated ? (
            <div className="predictionBalance" aria-live="polite">
              <img src={appAssetPath("/images/coins/gold-coin-stack-v2.png")} alt="" />
              <span>
                <small>Available</small>
                <strong>{formatCoinBalance(coinQuery.data?.balance ?? 0)}</strong>
              </span>
            </div>
          ) : null}
        </header>

        {marketQuery.error ? (
          <InlineState kind="error">
            {marketQuery.error instanceof Error
              ? marketQuery.error.message
              : "Unable to load this market."}
          </InlineState>
        ) : null}

        {marketState ? (
          <>
            <div className="predictionTradingGrid">
              <div className="predictionMarketMain">
                <section
                  className="predictionProbabilityPanel"
                  aria-labelledby="market-outcomes-title"
                >
                  <h2 className="visuallyHidden" id="market-outcomes-title">
                    Market outcomes
                  </h2>
                  <div className="predictionOutcomeList">
                    {marketDefinitions.map((definition, index) => {
                      const state = marketQueries[index]?.data;
                      const rowPositions = {
                        yes: state?.positions.find((entry) => entry.outcome === "yes"),
                        no: state?.positions.find((entry) => entry.outcome === "no"),
                      };
                      const rowOwned = {
                        yes: rowPositions.yes?.quantity ?? 0,
                        no: rowPositions.no?.quantity ?? 0,
                      };
                      const rowAskPrices = {
                        yes: state?.book.yes.asks[0]?.priceCents,
                        no: state?.book.no.asks[0]?.priceCents,
                      };
                      const rowLatestFill = state?.fills[0];
                      const rowYesPercent =
                        state?.market.status === "resolved"
                          ? state.market.outcome === "yes"
                            ? 100
                            : 0
                          : rowLatestFill
                            ? rowLatestFill.outcome === "yes"
                              ? rowLatestFill.priceCents
                              : 100 - rowLatestFill.priceCents
                            : definition.startingChance;
                      const isResolved = state?.market.status === "resolved";

                      return (
                        <div
                          className={`predictionOutcomeSummary${
                            activeMarketId === definition.id && !isResolved
                              ? " predictionOutcomeSummary--active"
                              : ""
                          }${isResolved ? " predictionOutcomeSummary--resolved" : ""}`}
                          key={definition.id}
                        >
                          <div className="predictionOutcomeMarketBlock">
                            {isResolved ? (
                              <div className="predictionOutcomeIdentity predictionOutcomeIdentity--resolved">
                                <img
                                  className="predictionOutcomeFlag"
                                  crossOrigin="anonymous"
                                  src={countryCodeToFlagUrl(definition.countryCode)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  aria-hidden="true"
                                />
                                <strong className="predictionOutcomeMarket">
                                  {definition.username}
                                </strong>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="predictionOutcomeIdentity predictionOutcomeToggle"
                                aria-expanded={expandedMarketId === definition.id}
                                aria-controls={`prediction-strike-${definition.id}`}
                                onClick={() => toggleMarket(definition.id)}
                              >
                                <img
                                  className="predictionOutcomeFlag"
                                  crossOrigin="anonymous"
                                  src={countryCodeToFlagUrl(definition.countryCode)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  aria-hidden="true"
                                />
                                <strong className="predictionOutcomeMarket">
                                  {definition.username}
                                </strong>
                              </button>
                            )}
                            {isAuthenticated && (rowOwned.yes > 0 || rowOwned.no > 0) ? (
                              <div className="predictionHoldings" aria-label="Your position">
                                {(["yes", "no"] as const).map((entry) =>
                                  rowOwned[entry] > 0 ? (
                                    <span
                                      className={`predictionHolding predictionHolding--${entry}`}
                                      key={entry}
                                    >
                                      <span className="predictionHoldingCheck" aria-hidden="true">
                                        ✓
                                      </span>
                                      <strong>
                                        {rowOwned[entry].toLocaleString()} {outcomeLabel(entry)}
                                      </strong>
                                      <span>
                                        (
                                        {averagePrice(
                                          rowPositions[entry]?.averagePriceCents ?? undefined,
                                        )}
                                        )
                                      </span>
                                    </span>
                                  ) : null,
                                )}
                              </div>
                            ) : null}
                          </div>
                          <span className="predictionOutcomeChance">
                            <small>Chance</small>
                            <strong>
                              {rowYesPercent === undefined ? "—" : `${rowYesPercent}%`}
                            </strong>
                          </span>
                          {isResolved ? (
                            <span
                              className={`predictionResolvedBadge predictionResolvedBadge--${state?.market.outcome ?? "no"}`}
                            >
                              Resolved {state?.market.outcome === "yes" ? "Yes" : "No"}
                            </span>
                          ) : (
                            <div
                              className="predictionOutcomeActions"
                              aria-label={`${definition.username} outcome`}
                            >
                              {(["yes", "no"] as const).map((entry) => (
                                <button
                                  type="button"
                                  className={`predictionOutcomeAction predictionOutcomeAction--${entry}`}
                                  aria-pressed={
                                    activeMarketId === definition.id && outcome === entry
                                  }
                                  onClick={() => {
                                    setActiveMarketId(definition.id);
                                    setExpandedMarketId(definition.id);
                                    setOutcome(entry);
                                    setSuccessMessage("");
                                  }}
                                  key={entry}
                                >
                                  <strong className="predictionOutcomeActionPrice">
                                    <span>{outcomeLabel(entry)}</span>
                                    {rowAskPrices[entry] === undefined ? (
                                      "—"
                                    ) : (
                                      <Price cents={rowAskPrices[entry]} />
                                    )}
                                  </strong>
                                </button>
                              ))}
                            </div>
                          )}
                          {!isResolved && expandedMarketId === definition.id
                            ? activeMarketPanel
                            : null}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="predictionActivityPanel" aria-labelledby="trades-title">
                  <h2 id="trades-title">Recent trades</h2>
                  {recentFills.length ? (
                    <div className="predictionTrades" role="list">
                      {recentFills.map((fill) => (
                        <div role="listitem" key={`${fill.definition.id}-${fill.id}`}>
                          <span
                            className={`predictionTradeQuote predictionTradeQuote--${fill.outcome}`}
                          >
                            <strong>
                              {fill.definition.username} · {outcomeLabel(fill.outcome)}
                            </strong>
                            <Price cents={fill.priceCents} />
                          </span>
                          <span className="predictionTradeQuantity">
                            {fill.quantity.toLocaleString()} contracts
                          </span>
                          <time dateTime={fill.createdAt}>
                            {formatLocalDateTime(fill.createdAt)}
                          </time>
                          <span className="predictionTradeParties">
                            <Link to="/@/$username" params={{ username: fill.buyerUsername }}>
                              {fill.buyerUsername}
                            </Link>
                            {fill.sellerUsername ? (
                              <>
                                <small>bought from</small>
                                <Link to="/@/$username" params={{ username: fill.sellerUsername }}>
                                  {fill.sellerUsername}
                                </Link>
                              </>
                            ) : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>No trades yet.</p>
                  )}
                </section>
              </div>
            </div>

            <section className="predictionAccountPanel" aria-labelledby="orders-title">
              <h2 id="orders-title">Your orders</h2>
              {!isAuthenticated ? (
                <p>Log in to view and manage your orders.</p>
              ) : (
                <>
                  <OrderTable
                    orders={marketState.orders}
                    cancellingId={cancelMutation.isPending ? cancelMutation.variables : undefined}
                    onCancel={(orderId) => cancelMutation.mutate(orderId)}
                  />
                  {cancelMutation.error ? (
                    <InlineState kind="error">
                      {cancelMutation.error instanceof Error
                        ? cancelMutation.error.message
                        : "Unable to cancel this order."}
                    </InlineState>
                  ) : null}
                </>
              )}
            </section>

            <details className="predictionRules">
              <summary>Resolution rules</summary>
              <p>{marketState.market.resolutionRules}</p>
              <a href={marketState.market.resolutionSourceUrl} target="_blank" rel="noreferrer">
                View resolution source
              </a>
            </details>
          </>
        ) : null}
      </section>
    </main>
  );
};

const VerticalOrderBook = ({
  bids,
  asks,
  onSelectBid,
  onSelectAsk,
}: {
  bids: Array<{ priceCents: number; quantity: number }>;
  asks: Array<{ priceCents: number; quantity: number }>;
  onSelectBid: (price: number, quantity: number) => void;
  onSelectAsk: (price: number, quantity: number) => void;
}) => {
  const bestBid = bids[0]?.priceCents;
  const bestAsk = asks[0]?.priceCents;
  const spread =
    bestBid === undefined || bestAsk === undefined ? undefined : Math.max(0, bestAsk - bestBid);

  const renderLevels = (
    levels: Array<{ priceCents: number; quantity: number }>,
    tone: "bid" | "ask",
    onSelect: (price: number, quantity: number) => void,
  ) =>
    levels.length ? (
      levels.map((level) => {
        const largestLevel = Math.max(...levels.map((entry) => entry.quantity));
        const depth = largestLevel > 0 ? Math.max(8, (level.quantity / largestLevel) * 100) : 0;
        return (
          <button
            type="button"
            className={`predictionBookLevel predictionBookLevel--${tone}`}
            style={{ "--prediction-book-depth": `${depth}%` } as CSSProperties}
            aria-label={`${tone === "ask" ? "Ask" : "Bid"} ${money(level.priceCents)}, ${level.quantity.toLocaleString()} contracts`}
            onClick={() => onSelect(level.priceCents, level.quantity)}
            key={`${tone}-${level.priceCents}`}
          >
            <strong>
              <Price cents={level.priceCents} />
            </strong>
            <span>{tone === "ask" ? "Ask" : "Bid"}</span>
            <b>{level.quantity.toLocaleString()}</b>
          </button>
        );
      })
    ) : (
      <p className="predictionBookEmpty">No {tone}s</p>
    );

  return (
    <div className="predictionOrderBook">
      <div className="predictionBookLabels" aria-hidden="true">
        <span>Price</span>
        <span>Side</span>
        <span>Contracts</span>
      </div>
      <div className="predictionBookStack predictionBookStack--asks">
        {renderLevels([...asks].reverse(), "ask", onSelectAsk)}
      </div>
      <div className="predictionBookSpread">
        {spread === undefined ? (
          <span aria-hidden="true" />
        ) : (
          <span>
            Spread <Price cents={spread} />
          </span>
        )}
      </div>
      <div className="predictionBookStack predictionBookStack--bids">
        {renderLevels(bids, "bid", onSelectBid)}
      </div>
    </div>
  );
};

const OrderTable = ({
  orders,
  cancellingId,
  onCancel,
}: {
  orders: Array<{
    id: number;
    outcome: PredictionOutcome;
    side: PredictionOrderSide;
    priceCents: number;
    quantity: number;
    filledQuantity: number;
    remainingQuantity: number;
    status: "open" | "partial" | "filled" | "cancelled";
    createdAt: string;
  }>;
  cancellingId: number | undefined;
  onCancel: (orderId: number) => void;
}) => {
  if (!orders.length) return <p>No orders yet.</p>;
  return (
    <div className="predictionOrdersWrap">
      <table className="predictionOrders">
        <thead>
          <tr>
            <th scope="col">Contract</th>
            <th scope="col">Price</th>
            <th scope="col">Filled</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="visuallyHidden">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const cancellable =
              ["open", "partial"].includes(order.status) && order.remainingQuantity > 0;
            return (
              <tr key={order.id}>
                <th scope="row">
                  {order.side === "buy" ? "Buy" : "Sell"} {outcomeLabel(order.outcome)}
                </th>
                <td>
                  <Price cents={order.priceCents} />
                </td>
                <td>
                  {order.filledQuantity}/{order.quantity}
                </td>
                <td>{order.status}</td>
                <td>
                  {cancellable ? (
                    <button
                      type="button"
                      disabled={cancellingId === order.id}
                      onClick={() => onCancel(order.id)}
                    >
                      {cancellingId === order.id ? "Cancelling…" : "Cancel"}
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
