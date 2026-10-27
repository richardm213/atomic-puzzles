import "./PredictionMarket.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { InlineState } from "../../components/InlineState/InlineState";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { formatCoinBalance } from "../../lib/coins/coinDisplay";
import { coinQueryKeys, coinSummaryQueryOptions } from "../../lib/coins/coinQueries";
import {
  predictionMarketQueryKey,
  predictionMarketQueryOptions,
} from "../../lib/predictionMarkets/predictionMarketQueries";
import {
  cancelPredictionOrder,
  placePredictionOrder,
  type PredictionOrderSide,
  type PredictionOutcome,
} from "../../lib/predictionMarkets/predictionMarkets";
import { appAssetPath } from "../../utils/appAssetPath";
import { formatLocalDateTime } from "../../utils/formatters";

const outcomeLabel = (outcome: PredictionOutcome) => (outcome === "yes" ? "Yes" : "No");
const money = (cents: number) => `${cents}¢`;

export const PredictionMarketPage = () => {
  const { isAuthenticated, isLoading: authLoading, login, user } = useAuth();
  const queryClient = useQueryClient();
  const username = user?.username ?? "anonymous";
  const marketQuery = useQuery(predictionMarketQueryOptions());
  const coinQuery = useQuery({
    ...coinSummaryQueryOptions(username),
    enabled: isAuthenticated,
  });
  const [outcome, setOutcome] = useState<PredictionOutcome>("yes");
  const [side, setSide] = useState<PredictionOrderSide>("buy");
  const [priceInput, setPriceInput] = useState("50");
  const [quantityInput, setQuantityInput] = useState("10");
  const [successMessage, setSuccessMessage] = useState("");

  const marketState = marketQuery.data;
  const price = Number(priceInput);
  const quantity = Number(quantityInput);
  const validPrice = Number.isInteger(price) && price >= 1 && price <= 99;
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 10_000;
  const orderValue = validPrice && validQuantity ? (price * quantity) / 100 : 0;
  const position = marketState?.positions.find((entry) => entry.outcome === outcome);
  const availableContracts = (position?.quantity ?? 0) - (position?.reservedQuantity ?? 0);
  const hasSellInventory = side === "buy" || (validQuantity && quantity <= availableContracts);
  const marketOpen =
    marketState?.market.status === "open" && Date.parse(marketState.market.closesAt) > Date.now();

  const askPrices = useMemo(() => {
    if (!marketState) return { yes: undefined, no: undefined };
    return {
      yes: marketState.book.yes.asks[0]?.priceCents,
      no: marketState.book.no.asks[0]?.priceCents,
    };
  }, [marketState]);

  const refreshMarket = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: predictionMarketQueryKey }),
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
    mutationFn: cancelPredictionOrder,
    onSuccess: refreshMarket,
  });

  const submitOrder = (event: FormEvent) => {
    event.preventDefault();
    setSuccessMessage("");
    if (!validPrice || !validQuantity || !hasSellInventory || !marketOpen) return;
    placeMutation.mutate({ outcome, side, priceCents: price, quantity });
  };

  if (marketQuery.isPending && !marketState) return <RouteLoadingFallback />;

  return (
    <main className="sitePage predictionMarketPage">
      <Seo
        title="Natso ban market"
        description="Trade the Natso Lichess ban prediction market with Atomic Coins."
        path="/betting/natso-ban-2026"
      />
      <section className="predictionMarketShell">
        <header className="predictionMarketHeader">
          <div>
            <Link to="/betting">← All markets</Link>
            <h1>{marketState?.market.question ?? "Natso ban market"}</h1>
            <div className="predictionMarketMeta">
              <span
                className={`predictionStatus predictionStatus--${marketOpen ? "open" : "closed"}`}
              >
                {marketOpen ? "Trading" : "Closed"}
              </span>
              {marketState ? (
                <span>Closes {formatLocalDateTime(marketState.market.closesAt)}</span>
              ) : null}
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
            <div className="predictionOutcomeSummary" aria-label="Best available asks">
              {(["yes", "no"] as const).map((entry) => (
                <button
                  type="button"
                  className={`predictionOutcomeCard predictionOutcomeCard--${entry}${outcome === entry ? " isSelected" : ""}`}
                  aria-pressed={outcome === entry}
                  onClick={() => setOutcome(entry)}
                  key={entry}
                >
                  <span>{outcomeLabel(entry)}</span>
                  {askPrices[entry] === undefined ? (
                    <small>No asks</small>
                  ) : (
                    <>
                      <strong>{money(askPrices[entry])}</strong>
                      <small>Best ask</small>
                    </>
                  )}
                </button>
              ))}
            </div>

            <div className="predictionTradingGrid">
              <section className="predictionBookPanel" aria-labelledby="order-book-title">
                <div className="predictionSectionHeader">
                  <h2 id="order-book-title">Order book</h2>
                  <span>{outcomeLabel(outcome)} contracts</span>
                </div>
                <div className="predictionBookColumns">
                  <OrderBookSide
                    label="Bids"
                    levels={marketState.book[outcome].bids}
                    tone="bid"
                    onSelect={(nextPrice) => {
                      setSide("sell");
                      setPriceInput(String(nextPrice));
                    }}
                  />
                  <OrderBookSide
                    label="Asks"
                    levels={marketState.book[outcome].asks}
                    tone="ask"
                    onSelect={(nextPrice) => {
                      setSide("buy");
                      setPriceInput(String(nextPrice));
                    }}
                  />
                </div>
                <p className="predictionBookNote">
                  A YES bid can also match a complementary NO bid when their prices total $1.
                </p>
              </section>

              <aside className="predictionTicket" aria-labelledby="order-ticket-title">
                <h2 id="order-ticket-title">Order ticket</h2>
                <div className="predictionTicketTabs" role="group" aria-label="Order side">
                  {(["buy", "sell"] as const).map((entry) => (
                    <button
                      type="button"
                      aria-pressed={side === entry}
                      onClick={() => setSide(entry)}
                      key={entry}
                    >
                      {entry === "buy" ? "Buy" : "Sell"}
                    </button>
                  ))}
                </div>
                <form onSubmit={submitOrder}>
                  <div className="predictionOutcomePicker" role="group" aria-label="Outcome">
                    {(["yes", "no"] as const).map((entry) => (
                      <button
                        type="button"
                        aria-pressed={outcome === entry}
                        onClick={() => setOutcome(entry)}
                        key={entry}
                      >
                        {outcomeLabel(entry)}
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
                  <label>
                    Contracts
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="10000"
                      step="1"
                      value={quantityInput}
                      onChange={(event) => setQuantityInput(event.target.value)}
                    />
                  </label>
                  <dl className="predictionOrderMath">
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
                    <small className="predictionInventory">
                      {availableContracts.toLocaleString()} {outcomeLabel(outcome)} contracts
                      available
                    </small>
                  ) : null}
                  {!hasSellInventory ? (
                    <InlineState kind="error">
                      You don’t have enough available contracts.
                    </InlineState>
                  ) : null}
                  {placeMutation.error ? (
                    <InlineState kind="error">
                      {placeMutation.error instanceof Error
                        ? placeMutation.error.message
                        : "Unable to place this order."}
                    </InlineState>
                  ) : null}
                  {successMessage ? (
                    <InlineState kind="success">{successMessage}</InlineState>
                  ) : null}
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
                      {placeMutation.isPending
                        ? "Placing order…"
                        : `${side === "buy" ? "Place bid" : "Place ask"} · ${outcomeLabel(outcome)} ${money(validPrice ? price : 0)}`}
                    </button>
                  ) : (
                    <button
                      className="predictionSubmit"
                      type="button"
                      disabled={authLoading}
                      onClick={() => void login("/betting/natso-ban-2026")}
                    >
                      Log in to trade
                    </button>
                  )}
                </form>
              </aside>
            </div>

            <section className="predictionAccountPanel" aria-labelledby="positions-title">
              <h2 id="positions-title">Your positions and orders</h2>
              {!isAuthenticated ? (
                <p>Log in to view your positions and manage open orders.</p>
              ) : (
                <>
                  <div className="predictionPositions">
                    {(["yes", "no"] as const).map((entry) => {
                      const entryPosition = marketState.positions.find(
                        (positionEntry) => positionEntry.outcome === entry,
                      );
                      return (
                        <div key={entry}>
                          <span>{outcomeLabel(entry)}</span>
                          <strong>{entryPosition?.quantity ?? 0}</strong>
                          <small>{entryPosition?.reservedQuantity ?? 0} in open asks</small>
                        </div>
                      );
                    })}
                  </div>
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

            <section className="predictionActivityPanel" aria-labelledby="trades-title">
              <h2 id="trades-title">Recent trades</h2>
              {marketState.fills.length ? (
                <div className="predictionTrades" role="list">
                  {marketState.fills.slice(0, 20).map((fill) => (
                    <div role="listitem" key={fill.id}>
                      <strong
                        className={`predictionTradeOutcome predictionTradeOutcome--${fill.outcome}`}
                      >
                        {outcomeLabel(fill.outcome)}
                      </strong>
                      <span>{money(fill.priceCents)}</span>
                      <span>{fill.quantity.toLocaleString()} contracts</span>
                      <time dateTime={fill.createdAt}>{formatLocalDateTime(fill.createdAt)}</time>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No trades yet.</p>
              )}
            </section>

            <details className="predictionRules">
              <summary>Resolution rules</summary>
              <p>{marketState.market.resolutionRules}</p>
              <a href={marketState.market.resolutionSourceUrl} target="_blank" rel="noreferrer">
                View the Lichess account
              </a>
            </details>
          </>
        ) : null}
      </section>
    </main>
  );
};

const OrderBookSide = ({
  label,
  levels,
  tone,
  onSelect,
}: {
  label: string;
  levels: Array<{ priceCents: number; quantity: number }>;
  tone: "bid" | "ask";
  onSelect: (price: number) => void;
}) => (
  <div className={`predictionBookSide predictionBookSide--${tone}`}>
    <h3>{label}</h3>
    <div className="predictionBookLabels" aria-hidden="true">
      <span>Price</span>
      <span>Contracts</span>
    </div>
    {levels.length ? (
      levels.slice(0, 8).map((level) => (
        <button type="button" onClick={() => onSelect(level.priceCents)} key={level.priceCents}>
          <strong>{money(level.priceCents)}</strong>
          <span>{level.quantity.toLocaleString()}</span>
        </button>
      ))
    ) : (
      <p>No {label.toLowerCase()}</p>
    )}
  </div>
);

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
                <td>{money(order.priceCents)}</td>
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
