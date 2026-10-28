import "./PredictionMarket.css";

import { faPen } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import type { CSSProperties, FormEvent } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";

import { InlineState } from "../../components/InlineState/InlineState";
import { PredictionMarketExplainer } from "../../components/PredictionMarketExplainer/PredictionMarketExplainer";
import {
  orderAppearsAtLevel,
  PredictionOrderEditor,
} from "../../components/PredictionOrderEditor/PredictionOrderEditor";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  AWC_NOT_TO_WIN_MARKET_ID,
  findCurrentTournamentOpponent,
  isRestrictedPredictionOrder,
  predictionOrderRestrictionMessage,
} from "../../lib/betting/betting";
import { allTournamentBetsQueryOptions } from "../../lib/betting/bettingQueries";
import { formatCoinBalance } from "../../lib/coins/coinDisplay";
import { coinQueryKeys, coinSummaryQueryOptions } from "../../lib/coins/coinQueries";
import { tournamentBracketQueryOptions } from "../../lib/matches/tournamentQueries";
import {
  patchPredictionMarketState,
  predictionMarketBatchQueryOptions,
  predictionMarketCatalogQueryOptions,
} from "../../lib/predictionMarkets/predictionMarketQueries";
import { usePredictionMarketRealtime } from "../../lib/predictionMarkets/predictionMarketRealtime";
import {
  cancelPredictionOrder,
  formatPredictionShares,
  placePredictionOrder,
  type PredictionMarketDefinition,
  type PredictionMarketId,
  predictionMarketVolume,
  type PredictionOrder,
  type PredictionOrderSide,
  type PredictionOutcome,
  predictionOutcomeAbbreviation,
  predictionOutcomeCountryCode,
  predictionOutcomeLabel,
  predictionOutcomes,
  predictionOutcomeUnderscoreLabel,
  predictionTakerFee,
  predictionYesChance,
  quotePredictionBuy,
  quotePredictionSell,
} from "../../lib/predictionMarkets/predictionMarkets";
import { appAssetPath } from "../../utils/appAssetPath";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { formatLocalDateTime } from "../../utils/formatters";

const outcomeLabel = (outcome: PredictionOutcome, definition?: PredictionMarketDefinition) =>
  predictionOutcomeLabel(definition, outcome);
const predictionAdminUsername = "prediction_admin";
const quickTradeStorageKey = "atomic-puzzles.prediction-markets.quick-trade";
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

const PredictionMatchupIdentity = ({ definition }: { definition: PredictionMarketDefinition }) => {
  if (!definition.outcomeLabels) {
    return (
      <>
        <img
          className="predictionOutcomeFlag"
          crossOrigin="anonymous"
          src={countryCodeToFlagUrl(definition.countryCode)}
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
        <strong className="predictionOutcomeMarket" title={definition.username}>
          {definition.username}
        </strong>
      </>
    );
  }

  return (
    <span className="predictionOutcomeMatchup">
      {predictionOutcomes.map((entry, index) => (
        <Fragment key={entry}>
          {index > 0 ? <span className="predictionOutcomeMatchupVs">vs</span> : null}
          <span className="predictionOutcomeMatchupPlayer">
            <img
              className="predictionOutcomeFlag"
              crossOrigin="anonymous"
              src={countryCodeToFlagUrl(predictionOutcomeCountryCode(definition, entry))}
              alt=""
              loading="lazy"
              decoding="async"
              aria-hidden="true"
            />
            <strong
              className="predictionOutcomeMarket"
              title={predictionOutcomeLabel(definition, entry)}
            >
              {predictionOutcomeUnderscoreLabel(definition, entry)}
            </strong>
          </span>
        </Fragment>
      ))}
    </span>
  );
};

export const PredictionMarketPage = () => {
  const { isAuthenticated, isLoading: authLoading, login, user } = useAuth();
  const queryClient = useQueryClient();
  const username = user?.username ?? "anonymous";
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const catalogQuery = useQuery(predictionMarketCatalogQueryOptions());
  const marketGroup = catalogQuery.data?.find((group) => group.path === pathname);
  const marketDefinitions: readonly PredictionMarketDefinition[] = useMemo(
    () => marketGroup?.markets ?? [],
    [marketGroup?.markets],
  );
  const [activeMarketId, setActiveMarketId] = useState<PredictionMarketId>("");
  const [expandedMarketId, setExpandedMarketId] = useState<PredictionMarketId | null>(null);
  const [editingOrders, setEditingOrders] = useState<PredictionOrder[] | null>(null);
  const marketIds = useMemo(
    () => marketDefinitions.map((market) => market.id),
    [marketDefinitions],
  );
  const marketsQuery = useQuery({
    ...predictionMarketBatchQueryOptions(marketIds),
    enabled: marketIds.length > 0,
  });
  const legacyBetsQuery = useQuery({
    ...allTournamentBetsQueryOptions(),
    enabled: Boolean(marketGroup),
  });
  usePredictionMarketRealtime(queryClient, marketIds);
  const marketStates = useMemo(() => marketsQuery.data ?? [], [marketsQuery.data]);
  const marketStateById = useMemo(
    () => new Map(marketStates.map((state) => [state.market.id, state])),
    [marketStates],
  );
  const activeMarketIndex = marketDefinitions.findIndex((market) => market.id === activeMarketId);
  const coinQuery = useQuery({
    ...coinSummaryQueryOptions(username),
    enabled: isAuthenticated,
  });
  const awcBracketQuery = useQuery({
    ...tournamentBracketQueryOptions("awc2026"),
    enabled: isAuthenticated && marketGroup?.id === "awc-2026-champion",
  });
  const [outcome, setOutcome] = useState<PredictionOutcome>("yes");
  const [side, setSide] = useState<PredictionOrderSide>("buy");
  const [priceInput, setPriceInput] = useState("50");
  const [quantityInput, setQuantityInput] = useState("10");
  const [successMessage, setSuccessMessage] = useState("");
  const [quickTrade, setQuickTrade] = useState(
    () =>
      typeof window !== "undefined" && window.localStorage.getItem(quickTradeStorageKey) === "true",
  );
  const marketVolume = marketStates.reduce(
    (total, state) => total + predictionMarketVolume(state),
    0,
  );

  useEffect(() => {
    const firstMarketId = marketDefinitions[0]?.id;
    if (!firstMarketId) return;
    setActiveMarketId(firstMarketId);
    setExpandedMarketId(null);
    setOutcome("yes");
    setSuccessMessage("");
  }, [marketDefinitions]);

  const marketState =
    marketStateById.get(activeMarketId) ?? marketStateById.get(marketDefinitions[0]?.id ?? "");
  const price = Number(priceInput);
  const quantity = Number(quantityInput);
  const validPrice = Number.isInteger(price) && price >= 1 && price <= 99;
  const validQuantity = Number.isInteger(quantity) && quantity >= 1 && quantity <= 10_000;
  const orderValue = validPrice && validQuantity ? (price * quantity) / 100 : 0;
  const buyQuote = quotePredictionBuy(
    marketState?.book[outcome].asks ?? [],
    validPrice ? price : 0,
    validQuantity ? quantity : 0,
  );
  const sellQuote = quotePredictionSell(
    marketState?.book[outcome].bids ?? [],
    validPrice ? price : 100,
    validQuantity ? quantity : 0,
  );
  const estimatedTakerFee = predictionTakerFee(
    side === "buy" ? buyQuote.fillCostCoins : sellQuote.proceedsCoins,
  );
  const estimatedBuyTotal = orderValue + estimatedTakerFee;
  const estimatedBuyProfit = quantity - estimatedBuyTotal;
  const estimatedSellProceeds = Math.max(0, sellQuote.proceedsCoins - estimatedTakerFee);
  const immediateBuyQuantity = buyQuote.filledQuantity;
  const restingBidQuantity = buyQuote.restingQuantity;
  const buyAction =
    immediateBuyQuantity === 0
      ? "Place bid"
      : restingBidQuantity === 0
        ? "Buy now"
        : "Buy now + place bid";
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
  const marketGroupOpen = marketStates.some(
    (state) => state.market.status === "open" && Date.parse(state.market.closesAt) > Date.now(),
  );

  const askPrices = useMemo(() => {
    if (!marketState) return { yes: undefined, no: undefined };
    return {
      yes: marketState.book.yes.asks[0]?.priceCents,
      no: marketState.book.no.asks[0]?.priceCents,
    };
  }, [marketState]);
  const activeMarketDefinition = marketDefinitions[activeMarketIndex] ?? marketDefinitions[0];
  const currentAwcOpponent = findCurrentTournamentOpponent(
    (awcBracketQuery.data?.matches ?? []).map((match) => ({
      p1: match.p1,
      p2: match.p2,
      s1: match.s1,
      s2: match.s2,
      matchId: match.match_id,
    })),
    username,
  );
  const orderRestrictionFor = (nextOutcome: PredictionOutcome, nextSide: PredictionOrderSide) =>
    activeMarketDefinition
      ? isRestrictedPredictionOrder({
          groupId: marketGroup?.id,
          marketPlayer: activeMarketDefinition.username,
          yesPlayer: activeMarketDefinition.outcomeLabels?.yes,
          noPlayer: activeMarketDefinition.outcomeLabels?.no,
          username,
          currentOpponent: currentAwcOpponent,
          outcome: nextOutcome,
          side: nextSide,
        })
      : null;
  const orderRestriction = activeMarketDefinition ? orderRestrictionFor(outcome, side) : null;
  const recentFills = useMemo(() => {
    const definitionByUsername = new Map(
      marketDefinitions.map((definition) => [definition.username.toLowerCase(), definition]),
    );
    const definitionById = new Map(
      marketDefinitions.map((definition) => [definition.id, definition]),
    );
    const exchangeFills = marketDefinitions.flatMap((definition) =>
      (marketStateById.get(definition.id)?.fills ?? []).map((fill) => ({ ...fill, definition })),
    );
    const legacyFills = (legacyBetsQuery.data ?? []).flatMap((bet) => {
      let legacyOutcome: PredictionOutcome | null = null;
      if (marketGroup?.id === "awc-2026-champion") {
        if (bet.marketId === "awc2026-winner") legacyOutcome = "yes";
        else if (bet.marketId === AWC_NOT_TO_WIN_MARKET_ID) legacyOutcome = "no";
      } else if (marketGroup?.id === "ban-2026" && bet.marketId.startsWith("lichess-ban-2026-")) {
        legacyOutcome = "yes";
      } else if (marketGroup?.id === "awc-2026-round-of-16") {
        const matchup = definitionById.get(bet.marketId);
        legacyOutcome =
          predictionOutcomes.find(
            (entry) => outcomeLabel(entry, matchup).toLowerCase() === bet.selection.toLowerCase(),
          ) ?? null;
      }
      if (!legacyOutcome) return [];

      const definition =
        definitionById.get(bet.marketId) ?? definitionByUsername.get(bet.selection.toLowerCase());
      if (!definition) return [];
      return [
        {
          id: -bet.id,
          outcome: legacyOutcome,
          priceCents: bet.priceCents,
          quantity: bet.potentialPayout,
          buyerUsername: bet.username,
          sellerUsername: null,
          createdAt: bet.placedAt,
          definition,
        },
      ];
    });

    return [...exchangeFills, ...legacyFills]
      .filter((fill) => fill.buyerUsername.toLowerCase() !== predictionAdminUsername)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id - left.id)
      .slice(0, 20);
  }, [legacyBetsQuery.data, marketDefinitions, marketGroup?.id, marketStateById]);
  const accountOrders = useMemo(
    () =>
      marketDefinitions
        .flatMap((definition) =>
          (marketStateById.get(definition.id)?.orders ?? []).map((order) => ({
            ...order,
            marketId: definition.id,
            marketName: definition.username,
            outcomeName: outcomeLabel(order.outcome, definition),
          })),
        )
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [marketDefinitions, marketStateById],
  );

  const updateCoinBalance = (balance: number) => {
    queryClient.setQueryData(coinQueryKeys.summary(username), (current: unknown) =>
      current && typeof current === "object" ? { ...current, balance } : current,
    );
  };

  const placeMutation = useMutation({
    mutationFn: placePredictionOrder,
    onSuccess: (result, variables) => {
      setSuccessMessage(`${variables.side === "buy" ? "Bid" : "Ask"} placed.`);
      updateCoinBalance(result.balance);
      patchPredictionMarketState(queryClient, result.state);
    },
  });
  const cancelMutation = useMutation({
    mutationFn: ({ marketId, orderId }: { marketId: PredictionMarketId; orderId: number }) =>
      cancelPredictionOrder(marketId, orderId),
    onSuccess: (result) => {
      updateCoinBalance(result.balance);
      patchPredictionMarketState(queryClient, result.state);
    },
  });

  const submitOrder = (event: FormEvent) => {
    event.preventDefault();
    setSuccessMessage("");
    if (!validPrice || !validQuantity || !hasSellInventory || !marketOpen || orderRestriction)
      return;
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
    if (!quickTrade || !isAuthenticated || placeMutation.isPending || !marketOpen) return;
    const nextRestriction = orderRestrictionFor(outcome, nextSide);
    const nextHasInventory =
      nextSide === "buy" ||
      (availableByOutcome[outcome] > 0 && nextQuantity <= availableByOutcome[outcome]);
    if (nextRestriction || !nextHasInventory) return;
    placeMutation.mutate({
      marketId: activeMarketId,
      outcome,
      side: nextSide,
      priceCents: nextPrice,
      quantity: nextQuantity,
    });
  };

  const toggleQuickTrade = (checked: boolean) => {
    setQuickTrade(checked);
    window.localStorage.setItem(quickTradeStorageKey, String(checked));
  };

  const toggleMarket = (marketId: PredictionMarketId) => {
    setActiveMarketId(marketId);
    setExpandedMarketId((current) => (current === marketId ? null : marketId));
    setSuccessMessage("");
  };

  const toggleOutcome = (marketId: PredictionMarketId, nextOutcome: PredictionOutcome) => {
    const isOpenSelection =
      expandedMarketId === marketId && activeMarketId === marketId && outcome === nextOutcome;

    setActiveMarketId(marketId);
    setExpandedMarketId(isOpenSelection ? null : marketId);
    setOutcome(nextOutcome);
    setSuccessMessage("");
  };

  const activeMarketPanel =
    marketState && activeMarketDefinition ? (
      <div className="predictionStrikeDrawer" id={`prediction-strike-${activeMarketDefinition.id}`}>
        <section className="predictionBookPanel" aria-labelledby="order-book-title">
          <div className="predictionSectionHeader">
            <h2 id="order-book-title">Order book</h2>
          </div>
          <VerticalOrderBook
            outcome={outcome}
            outcomeName={outcomeLabel(outcome, activeMarketDefinition)}
            bids={marketState.book[outcome].bids}
            asks={marketState.book[outcome].asks}
            ownOrders={marketState.orders}
            onEditOrders={setEditingOrders}
            onSelectBid={(nextPrice, nextQuantity) =>
              startOrderFromBook("sell", nextPrice, nextQuantity)
            }
            onSelectAsk={(nextPrice, nextQuantity) =>
              startOrderFromBook("buy", nextPrice, nextQuantity)
            }
          />
        </section>
      </div>
    ) : null;

  const activeMarketTicket =
    marketState && activeMarketDefinition ? (
      <aside className="predictionTicket" aria-labelledby="order-ticket-title">
        <h2 id="order-ticket-title">Order ticket</h2>
        <div className="predictionTicketHeader">
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
          <div className="predictionTicketMode">
            <span className="predictionTicketOrderType">Limit</span>
            {isAuthenticated ? (
              <label className="predictionQuickTrade">
                <input
                  type="checkbox"
                  checked={quickTrade}
                  onChange={(event) => toggleQuickTrade(event.target.checked)}
                />
                Quick trade
              </label>
            ) : null}
          </div>
        </div>
        <div className="predictionTicketContract">
          <div className="predictionTicketMarket">
            <img
              className="predictionOutcomeFlag"
              crossOrigin="anonymous"
              src={countryCodeToFlagUrl(
                predictionOutcomeCountryCode(activeMarketDefinition, outcome),
              )}
              alt=""
              loading="lazy"
              decoding="async"
              aria-hidden="true"
            />
            <strong title={outcomeLabel(outcome, activeMarketDefinition)}>
              {outcomeLabel(outcome, activeMarketDefinition)}
            </strong>
          </div>
        </div>
        <form onSubmit={submitOrder}>
          <div className="predictionTicketQuoteRow">
            <div
              className={`predictionOutcomePicker predictionOutcomePicker--${side}`}
              role="group"
              aria-label="Outcome"
            >
              {predictionOutcomes.map((entry) => (
                <button
                  type="button"
                  aria-pressed={outcome === entry}
                  disabled={
                    (side === "sell" && availableByOutcome[entry] <= 0) ||
                    Boolean(orderRestrictionFor(entry, side))
                  }
                  onClick={() => setOutcome(entry)}
                  key={entry}
                >
                  <span className="predictionOutcomePrimary">
                    <span>{predictionOutcomeAbbreviation(activeMarketDefinition, entry)}</span>
                    {askPrices[entry] === undefined ? null : (
                      <strong>
                        <Price cents={askPrices[entry]} />
                      </strong>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="predictionTicketFields">
            <div className="predictionQuantityField predictionTicketField">
              <div className="predictionQuantityLabel">
                <label htmlFor="prediction-contract-quantity">Contracts</label>
                {side === "sell" && availableContracts > 0 ? (
                  <button
                    type="button"
                    onClick={() => setQuantityInput(String(availableContracts))}
                  >
                    Max
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
            <label className="predictionTicketField" htmlFor="prediction-limit-price">
              <span>Limit price</span>
              <span className="predictionInputSuffix">
                <input
                  id="prediction-limit-price"
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
          </div>
          <dl className="predictionOrderMath">
            {side === "buy" ? (
              <>
                <div className="predictionOrderCost">
                  <dt>Cost</dt>
                  <dd>{estimatedBuyTotal.toFixed(2)} coins</dd>
                </div>
                <div className="predictionOrderPayout">
                  <dt>Max payout</dt>
                  <dd>
                    <strong>{validQuantity ? `${quantity.toLocaleString()} coins` : "—"}</strong>
                    {validPrice && validQuantity ? (
                      <small className={estimatedBuyProfit >= 0 ? "isPositive" : "isNegative"}>
                        {estimatedBuyProfit >= 0 ? "+" : ""}
                        {estimatedBuyProfit.toFixed(2)} coins
                      </small>
                    ) : null}
                  </dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>Proceeds</dt>
                  <dd>{estimatedSellProceeds.toFixed(2)} coins</dd>
                </div>
                <div className="predictionOrderCost">
                  <dt>Offered</dt>
                  <dd>{validQuantity ? quantity.toLocaleString() : "—"}</dd>
                </div>
              </>
            )}
          </dl>
          {side === "buy" && validQuantity && restingBidQuantity > 0 ? (
            <InlineState kind="info">
              Only {buyQuote.availableQuantity.toLocaleString()} contracts are available at or below
              your limit. The remaining {restingBidQuantity.toLocaleString()} will stay open as a
              bid.
            </InlineState>
          ) : null}
          {side === "sell" && validQuantity && sellQuote.restingQuantity > 0 ? (
            <InlineState kind="info">
              Only {sellQuote.availableQuantity.toLocaleString()} contracts can sell immediately at
              or above your limit. The remaining {sellQuote.restingQuantity.toLocaleString()}
              will stay open as an ask.
            </InlineState>
          ) : null}
          {side === "sell" ? (
            <div className="predictionInventory">
              <strong>
                {availableContracts.toLocaleString()}{" "}
                {outcomeLabel(outcome, activeMarketDefinition)} contracts available
              </strong>
              <small>Selling uses contracts you own. It does not spend coins.</small>
            </div>
          ) : null}
          {!hasSellInventory ? (
            <InlineState kind="error">You don’t have enough available contracts.</InlineState>
          ) : null}
          {orderRestriction ? (
            <InlineState kind="error">
              {predictionOrderRestrictionMessage(orderRestriction, marketGroup?.id)}
            </InlineState>
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
                Boolean(orderRestriction) ||
                !marketOpen ||
                placeMutation.isPending
              }
            >
              {placeMutation.isPending ? (
                "Placing order…"
              ) : (
                <>
                  {side === "buy" ? buyAction : "Place ask"} ·{" "}
                  {outcomeLabel(outcome, activeMarketDefinition)}{" "}
                  <Price cents={validPrice ? price : 0} />
                </>
              )}
            </button>
          ) : (
            <button
              className="predictionSubmit"
              type="button"
              disabled={authLoading}
              onClick={() => void login(marketGroup?.path ?? pathname)}
            >
              Log in to trade
            </button>
          )}
        </form>
      </aside>
    ) : null;

  if (catalogQuery.isPending || !marketGroup) return <RouteLoadingFallback />;
  if (marketsQuery.isPending && marketStates.length === 0) return <RouteLoadingFallback />;
  const showShieldIcon = marketGroup.id === "november-atomic-shield-2026";

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
            <div className="predictionMarketTitle">
              {showShieldIcon ? (
                <img
                  className="predictionMarketTitleIcon"
                  src={appAssetPath("/images/arenas/atomic-shield.png")}
                  alt=""
                  aria-hidden="true"
                />
              ) : null}
              <h1>{marketGroup.title}</h1>
              <PredictionMarketExplainer />
            </div>
            <div className="predictionMarketMeta">
              <span
                className={`predictionStatus predictionStatus--${marketGroupOpen ? "open" : "closed"}`}
              >
                {marketGroupOpen ? "Open" : "Closed"}
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

        {marketsQuery.error ? (
          <InlineState kind="error">
            {marketsQuery.error instanceof Error
              ? marketsQuery.error.message
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
                    <div className="predictionOutcomeHeader" aria-hidden="true">
                      <span />
                      <span>Chance</span>
                      <span />
                    </div>
                    {marketDefinitions.map((definition) => {
                      const state = marketStateById.get(definition.id);
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
                      const settlementPrice = state?.market.settlementPriceCents;
                      const rowYesPercent = predictionYesChance(definition, state);
                      const isResolved = state?.market.status === "resolved";

                      return (
                        <div
                          className={`predictionOutcomeSummary${
                            activeMarketId === definition.id && !isResolved
                              ? " predictionOutcomeSummary--active predictionOutcomeSummary--interactive"
                              : !isResolved
                                ? " predictionOutcomeSummary--interactive"
                                : ""
                          }${isResolved ? " predictionOutcomeSummary--resolved" : ""}`}
                          onClick={
                            isResolved
                              ? undefined
                              : (event) => {
                                  const target = event.target as HTMLElement;
                                  if (target.closest("button, a, .predictionStrikeDrawer")) {
                                    return;
                                  }
                                  toggleMarket(definition.id);
                                }
                          }
                          key={definition.id}
                        >
                          <div className="predictionOutcomeMarketBlock">
                            {isResolved ? (
                              <div className="predictionOutcomeIdentity predictionOutcomeIdentity--resolved">
                                <PredictionMatchupIdentity definition={definition} />
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="predictionOutcomeIdentity predictionOutcomeToggle"
                                aria-expanded={expandedMarketId === definition.id}
                                aria-controls={`prediction-strike-${definition.id}`}
                                onClick={() => toggleMarket(definition.id)}
                              >
                                <PredictionMatchupIdentity definition={definition} />
                              </button>
                            )}
                            {isAuthenticated && (rowOwned.yes > 0 || rowOwned.no > 0) ? (
                              <div className="predictionHoldings" aria-label="Your position">
                                {predictionOutcomes.map((entry) =>
                                  rowOwned[entry] > 0 ? (
                                    <span
                                      className={`predictionHolding predictionHolding--${entry}`}
                                      key={entry}
                                    >
                                      <span className="predictionHoldingCheck" aria-hidden="true">
                                        ✓
                                      </span>
                                      <strong>
                                        {`${formatPredictionShares(rowOwned[entry])} ${outcomeLabel(
                                          entry,
                                          definition,
                                        )}`}
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
                          {isResolved ? (
                            <span
                              className={`predictionResolvedResult ${
                                settlementPrice === null || settlementPrice === undefined
                                  ? `predictionResolvedResult--${state?.market.outcome ?? "no"}`
                                  : "predictionResolvedResult--price"
                              }`}
                              aria-label={
                                settlementPrice === null || settlementPrice === undefined
                                  ? `Resolved ${state?.market.outcome === "yes" ? "Yes" : "No"}`
                                  : `Settled at ${settlementPrice} cents`
                              }
                            >
                              <strong>
                                {settlementPrice === null || settlementPrice === undefined
                                  ? outcomeLabel(state?.market.outcome ?? "no", definition)
                                  : `Settled ${settlementPrice}¢`}
                              </strong>
                            </span>
                          ) : (
                            <>
                              <span className="predictionOutcomeChance">
                                <strong>
                                  {rowYesPercent === undefined ? "—" : `${rowYesPercent}%`}
                                </strong>
                              </span>
                              <div
                                className="predictionOutcomeActions"
                                aria-label={`${definition.username} outcome`}
                              >
                                {predictionOutcomes.map((entry) => (
                                  <button
                                    type="button"
                                    className={`predictionOutcomeAction predictionOutcomeAction--${entry}`}
                                    aria-pressed={
                                      expandedMarketId === definition.id &&
                                      activeMarketId === definition.id &&
                                      outcome === entry
                                    }
                                    onClick={() => toggleOutcome(definition.id, entry)}
                                    key={entry}
                                  >
                                    <strong className="predictionOutcomeActionPrice">
                                      <span>
                                        {predictionOutcomeAbbreviation(definition, entry)}
                                      </span>
                                      {rowAskPrices[entry] === undefined ? (
                                        "—"
                                      ) : (
                                        <Price cents={rowAskPrices[entry]} />
                                      )}
                                    </strong>
                                  </button>
                                ))}
                              </div>
                            </>
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
                              {fill.definition.username} ·{" "}
                              {outcomeLabel(fill.outcome, fill.definition)}
                            </strong>
                            <Price cents={fill.priceCents} />
                          </span>
                          <span className="predictionTradeQuantity">
                            {formatPredictionShares(fill.quantity)} contracts
                          </span>
                          <time dateTime={fill.createdAt}>
                            {formatLocalDateTime(fill.createdAt)}
                          </time>
                          <span className="predictionTradeParties">
                            <Link to="/@/$username" params={{ username: fill.buyerUsername }}>
                              {fill.buyerUsername}
                            </Link>
                            {fill.sellerUsername &&
                            fill.sellerUsername.toLowerCase() !== predictionAdminUsername ? (
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
              {activeMarketTicket}
            </div>

            <section className="predictionAccountPanel" aria-labelledby="orders-title">
              <h2 id="orders-title">Your orders</h2>
              {!isAuthenticated ? (
                <p>Log in to view and manage your orders.</p>
              ) : (
                <>
                  <OrderTable
                    orders={accountOrders}
                    cancellingId={
                      cancelMutation.isPending ? cancelMutation.variables.orderId : undefined
                    }
                    onCancel={(marketId, orderId) => cancelMutation.mutate({ marketId, orderId })}
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
              {marketState.market.settlementPriceCents !== null ? (
                <p>
                  {`Settlement: ${marketState.market.settlementPriceCents}¢ Yes / ${100 - marketState.market.settlementPriceCents}¢ No`}
                  {marketState.market.settlementReferenceFillId !== null
                    ? ` · Reference trade #${marketState.market.settlementReferenceFillId}`
                    : ""}
                </p>
              ) : null}
              <a href={marketState.market.resolutionSourceUrl} target="_blank" rel="noreferrer">
                View resolution source
              </a>
            </details>
          </>
        ) : null}
      </section>
      {editingOrders ? (
        <PredictionOrderEditor
          marketId={activeMarketId}
          outcome={outcome}
          orders={editingOrders}
          onClose={() => setEditingOrders(null)}
          onUpdated={(result) => {
            updateCoinBalance(result.balance);
            patchPredictionMarketState(queryClient, result.state);
          }}
        />
      ) : null}
    </main>
  );
};

const VerticalOrderBook = ({
  outcome,
  outcomeName,
  bids,
  asks,
  ownOrders,
  onEditOrders,
  onSelectBid,
  onSelectAsk,
}: {
  outcome: PredictionOutcome;
  outcomeName: string;
  bids: Array<{ priceCents: number; quantity: number }>;
  asks: Array<{ priceCents: number; quantity: number }>;
  ownOrders: PredictionOrder[];
  onEditOrders: (orders: PredictionOrder[]) => void;
  onSelectBid: (price: number, quantity: number) => void;
  onSelectAsk: (price: number, quantity: number) => void;
}) => {
  const renderLevels = (
    levels: Array<{ priceCents: number; quantity: number }>,
    tone: "bid" | "ask",
    onSelect: (price: number, quantity: number) => void,
  ) => {
    if (!levels.length) return <p className="predictionBookEmpty">No {tone}s</p>;
    const totalQuantity = levels.reduce((total, level) => total + level.quantity, 0);
    return levels.map((level, index) => {
      const ordersAtLevel = ownOrders.filter((order) =>
        orderAppearsAtLevel(order, outcome, tone, level.priceCents),
      );
      const coinValue = (level.priceCents * level.quantity) / 100;
      const cumulativeQuantity =
        tone === "ask"
          ? levels.slice(index).reduce((total, entry) => total + entry.quantity, 0)
          : levels.slice(0, index + 1).reduce((total, entry) => total + entry.quantity, 0);
      const barWidth = Math.max(2, (cumulativeQuantity / totalQuantity) * 72);
      return (
        <div className="predictionBookLevelWrap" key={`${tone}-${level.priceCents}`}>
          <button
            type="button"
            className={`predictionBookLevel predictionBookLevel--${tone}`}
            style={{ "--prediction-book-bar": `${barWidth}%` } as CSSProperties}
            aria-label={`${tone === "ask" ? "Ask" : "Bid"} ${money(level.priceCents)}, ${level.quantity.toLocaleString()} contracts, ${formatCoinBalance(coinValue)} coins`}
            onClick={() => onSelect(level.priceCents, level.quantity)}
          >
            <strong>
              <Price cents={level.priceCents} />
            </strong>
            <span>{tone === "ask" ? "Ask" : "Bid"}</span>
            <b>{level.quantity.toLocaleString()}</b>
            <b>{formatCoinBalance(coinValue)} coins</b>
          </button>
          {ordersAtLevel.length ? (
            <button
              type="button"
              className="predictionOwnOrderButton"
              aria-label={`Edit your order at ${level.priceCents} cents`}
              title="Your order — edit"
              onClick={() => onEditOrders(ordersAtLevel)}
            >
              <FontAwesomeIcon icon={faPen} />
            </button>
          ) : null}
        </div>
      );
    });
  };

  return (
    <div className="predictionOrderBook">
      <div className="predictionBookLabels" aria-hidden="true">
        <span>Price</span>
        <span>Side</span>
        <span>Contracts</span>
        <span>Coin value</span>
      </div>
      <div className="predictionBookStack predictionBookStack--asks">
        {renderLevels([...asks].reverse(), "ask", onSelectAsk)}
      </div>
      <div
        className={`predictionBookTrade predictionBookTrade--${outcome}`}
        aria-label={`Trading ${outcomeName}`}
      >
        Trade {outcomeName}
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
    marketId: PredictionMarketId;
    marketName: string;
    outcomeName: string;
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
  onCancel: (marketId: PredictionMarketId, orderId: number) => void;
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
                  <span className="predictionOrderContract">
                    <strong>{order.marketName}</strong>
                    <small>
                      {order.side === "buy" ? "Buy" : "Sell"} {order.outcomeName}
                    </small>
                  </span>
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
                      onClick={() => onCancel(order.marketId, order.id)}
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
