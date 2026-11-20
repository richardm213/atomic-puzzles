import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { BetShareSlip } from "../../components/BetShareSlip/BetShareSlip";
import { InlineState } from "../../components/InlineState/InlineState";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { usePersistedState } from "../../hooks/usePersistedState";
import { useUnderscoreUsernameCutoff } from "../../hooks/useUnderscoreUsernameCutoff";
import { formatCoinValue } from "../../lib/coins/coinDisplay";
import {
  type PredictionMarketGroup,
  type PredictionMarketState,
  sortPredictionMarketsByChance,
} from "../../lib/predictionMarkets/predictionMarkets";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { getErrorMessage } from "../../utils/errors";
import { formatLocalDateTime } from "../../utils/formatters";
import { type BetHistoryEntry, betHistoryReturn } from "./bettingHistoryModel";

const BetHistoryUsername = ({ username }: { username: string }) => {
  const { displayName, elementRef } = useUnderscoreUsernameCutoff<HTMLSpanElement>(username);
  return (
    <span
      ref={elementRef}
      className="betHistoryUsernameCutoff"
      title={username}
      aria-label={username}
    >
      {displayName}
    </span>
  );
};

const BetHistoryBettorLink = ({ username }: { username: string }) => {
  const { displayName, elementRef } = useUnderscoreUsernameCutoff<HTMLAnchorElement>(username);
  return (
    <PlayerLink ref={elementRef} username={username} title={username} aria-label={username}>
      {displayName}
    </PlayerLink>
  );
};

const filterHistoryBets = ({
  bets,
  status,
  marketId,
  bettor,
}: {
  bets: BetHistoryEntry[];
  status: string;
  marketId: string;
  bettor?: string;
}): BetHistoryEntry[] => {
  const normalizedBettor = bettor?.trim().toLowerCase() ?? "";
  const matchesStatus = (bet: BetHistoryEntry) =>
    status === "all" ||
    bet.status === status ||
    (status === "resolved" && ["won", "lost", "settled"].includes(bet.status));
  return bets.filter(
    (bet) =>
      matchesStatus(bet) &&
      (marketId === "all" || bet.marketId === marketId) &&
      (!normalizedBettor || bet.username.toLowerCase().includes(normalizedBettor)),
  );
};

const returnDisplaySchema = z.enum(["return", "pnl"]);
type ReturnDisplay = z.infer<typeof returnDisplaySchema>;

type BetSortColumn = "selection" | "bettor" | "price" | "cost" | "pnl";
const betSortValue = (bet: BetHistoryEntry, column: BetSortColumn): string | number => {
  switch (column) {
    case "selection":
      return (bet.predictionSelectionLabel ?? bet.selection).toLowerCase();
    case "bettor":
      return bet.username.toLowerCase();
    case "price":
      return bet.priceCents;
    case "cost":
      return bet.totalCost;
    case "pnl":
      return bet.pnl;
  }
};

export const BetHistoryTable = ({
  bets,
  countryByPlayer,
  emptyMessage,
  showUsername = false,
  returnDisplay,
  priceLabel = "Avg. price",
  showStatus = true,
  showMarket = true,
  sortable = false,
  showUnits = true,
  onSelectBet,
}: {
  bets: BetHistoryEntry[];
  countryByPlayer: Record<string, string>;
  emptyMessage: string;
  showUsername?: boolean;
  returnDisplay: ReturnDisplay;
  priceLabel?: string;
  showStatus?: boolean;
  showMarket?: boolean;
  sortable?: boolean;
  showUnits?: boolean;
  onSelectBet?: (bet: BetHistoryEntry) => void;
}) => {
  const [sharedBet, setSharedBet] = useState<BetHistoryEntry | null>(null);
  const table = useRef<HTMLTableElement>(null);
  const shareable = showStatus;
  const [sort, setSort] = useState<{
    column: BetSortColumn;
    direction: "ascending" | "descending";
  }>({ column: "cost", direction: "descending" });
  const sortedBets = sortable
    ? [...bets].sort((left, right) => {
        const a = betSortValue(left, sort.column);
        const b = betSortValue(right, sort.column);
        const comparison =
          typeof a === "string" && typeof b === "string"
            ? a.localeCompare(b)
            : Number(a) - Number(b);
        return sort.direction === "ascending" ? comparison : -comparison;
      })
    : bets;
  useEffect(() => {
    const element = table.current;
    if ((!shareable && !onSelectBet) || !element) return;
    const openRow = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest("a, button, input, select")) return;
      const row = target.closest<HTMLElement>("tr[data-bet-index]");
      if (!row) return;
      const bet = sortedBets[Number(row.dataset.betIndex)];
      if (bet) {
        if (onSelectBet) {
          onSelectBet(bet);
          return;
        }
        row.querySelector<HTMLButtonElement>(".betHistorySlipTrigger")?.focus();
        setSharedBet(bet);
      }
    };
    element.addEventListener("click", openRow);
    return () => element.removeEventListener("click", openRow);
  }, [shareable, sortedBets, onSelectBet]);
  const columnHeader = (column: BetSortColumn, label: string) => (
    <th
      scope="col"
      title={
        column === "cost"
          ? "Cost basis, including purchase fees. Fully exited positions show the cost of the shares closed."
          : undefined
      }
      aria-sort={sortable ? (sort.column === column ? sort.direction : "none") : undefined}
    >
      {sortable ? (
        <button
          type="button"
          className="betHistorySortButton"
          onClick={() =>
            setSort((current) => ({
              column,
              direction:
                current.column === column
                  ? current.direction === "ascending"
                    ? "descending"
                    : "ascending"
                  : column === "selection" || column === "bettor"
                    ? "ascending"
                    : "descending",
            }))
          }
        >
          {label}
          <span aria-hidden="true">
            {sort.column === column ? (sort.direction === "ascending" ? "↑" : "↓") : null}
          </span>
        </button>
      ) : (
        label
      )}
    </th>
  );
  if (!bets.length) return <InlineState kind="empty">{emptyMessage}</InlineState>;

  return (
    <>
      <div className={`betHistoryTableWrap${showUsername ? " betHistoryTableWrap--all" : ""}`}>
        <table ref={table} className="betHistoryTable">
          <caption className="betHistoryCaption">{showUsername ? "All bets" : "My bets"}</caption>
          <thead>
            <tr>
              {columnHeader("selection", "Selection")}
              {showUsername ? columnHeader("bettor", "Bettor") : null}
              {columnHeader("price", priceLabel)}
              {columnHeader("cost", "Cost")}
              {columnHeader("pnl", returnDisplay === "pnl" ? "P&L" : "Return")}
              {showStatus ? <th scope="col">Status</th> : null}
            </tr>
          </thead>
          <tbody>
            {sortedBets.map((bet, index) => {
              const selectionLabel = bet.predictionSelectionLabel ?? bet.selection;
              const countryCode =
                bet.predictionSelectionCountryCode ??
                countryByPlayer[selectionLabel.toLowerCase()] ??
                "";
              const payout = betHistoryReturn(bet);
              const pnl = Math.round(bet.pnl * 100) / 100 || 0;
              const showPnl = returnDisplay === "pnl";
              const result =
                bet.status === "open"
                  ? showPnl
                    ? "possible"
                    : undefined
                  : pnl > 0
                    ? "gain"
                    : pnl < 0
                      ? "loss"
                      : undefined;
              const selectionContents = (
                <>
                  <BetHistoryUsername username={selectionLabel.toLowerCase()} />
                  {bet.predictionOutcome && !bet.predictionSelectionLabel ? (
                    <span className="betHistoryOutcome">
                      · {bet.predictionOutcome === "yes" ? "Yes" : "No"}
                    </span>
                  ) : null}
                </>
              );
              return (
                <tr
                  key={bet.historyKey}
                  className={shareable || onSelectBet ? "betHistoryShareRow" : undefined}
                  data-bet-index={shareable || onSelectBet ? index : undefined}
                  tabIndex={onSelectBet ? 0 : undefined}
                  onKeyDown={
                    onSelectBet
                      ? (event) => {
                          if (
                            event.target !== event.currentTarget ||
                            !["Enter", " "].includes(event.key)
                          )
                            return;
                          event.preventDefault();
                          onSelectBet(bet);
                        }
                      : undefined
                  }
                >
                  <th className="betHistorySelection" scope="row">
                    <span className="betHistoryPlayer">
                      <img
                        src={countryCodeToFlagUrl(countryCode)}
                        alt={countryCode ? `${countryCode} flag` : "Country unavailable"}
                        crossOrigin="anonymous"
                        loading="lazy"
                        decoding="async"
                      />
                      <strong>
                        {shareable || onSelectBet ? (
                          <button
                            type="button"
                            className="betHistorySlipTrigger"
                            aria-label={
                              onSelectBet
                                ? `View transactions for ${bet.username}`
                                : `Share bet on ${selectionLabel} by ${bet.username}`
                            }
                            onClick={() => (onSelectBet ? onSelectBet(bet) : setSharedBet(bet))}
                          >
                            {selectionContents}
                          </button>
                        ) : (
                          selectionContents
                        )}
                      </strong>
                    </span>
                    {showMarket ? (
                      <span className="betHistoryMarket">
                        {bet.predictionMarketTitle ?? "Prediction market"}
                      </span>
                    ) : null}
                  </th>
                  {showUsername ? (
                    <td className="betHistoryBettor" data-label="Bettor">
                      <BetHistoryBettorLink username={bet.username} />
                    </td>
                  ) : null}
                  <td className="betHistoryNumber" data-label={priceLabel}>
                    <strong>
                      {bet.priceCents.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      <span className="betHistoryPriceSuffix">¢</span>
                    </strong>
                  </td>
                  <td className="betHistoryNumber" data-label="Cost">
                    <strong>{formatCoinValue(bet.totalCost)}</strong>
                    {showUnits ? <small>coins</small> : null}
                  </td>
                  <td
                    className="betHistoryNumber betHistoryReturn"
                    data-label={showPnl ? "P&L" : "Return"}
                    data-result={result}
                  >
                    <strong>
                      {showPnl
                        ? `${pnl > 0 ? "+" : ""}${formatCoinValue(pnl)}`
                        : formatCoinValue(payout)}
                    </strong>
                    {showUnits ? (
                      <small
                        className={
                          showPnl && pnl !== 0 && bet.status !== "open"
                            ? "betHistoryPnlUnit"
                            : undefined
                        }
                      >
                        {bet.status === "open" ? "possible" : showPnl ? "coins" : "paid"}
                      </small>
                    ) : null}
                  </td>
                  {showStatus ? (
                    <td className="betHistoryState" data-label="Status">
                      <span className={`betStatus betStatus--${bet.status}`}>
                        {bet.status === "open" ? "Open" : bet.status}
                      </span>
                      <time dateTime={bet.placedAt}>{formatLocalDateTime(bet.placedAt)}</time>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sharedBet ? (
        <BetShareSlip
          bet={sharedBet}
          countryCode={
            sharedBet.predictionSelectionCountryCode ??
            countryByPlayer[
              (sharedBet.predictionSelectionLabel ?? sharedBet.selection).toLowerCase()
            ] ??
            ""
          }
          marketTitle={sharedBet.predictionMarketTitle ?? sharedBet.marketId}
          onClose={() => setSharedBet(null)}
        />
      ) : null}
    </>
  );
};

type BettingHistoryProps = {
  view: "mine" | "all";
  isAuthenticated: boolean;
  authLoading: boolean;
  onLogin: () => void;
  myBets: BetHistoryEntry[];
  allBets: BetHistoryEntry[];
  predictionMarketGroups: PredictionMarketGroup[];
  predictionMarketStates: PredictionMarketState[];
  countryByPlayer: Record<string, string>;
  loading: boolean;
  error: unknown;
};

const historyStatusFilters = new Set(["all", "open", "resolved"]);

type HistoryFilters = {
  bettor: string;
  market: string;
  status: string;
};

const historyFiltersFromSearch = (
  view: BettingHistoryProps["view"],
  search: string,
): HistoryFilters => {
  const searchParams = new URLSearchParams(search);
  const requestedStatus = searchParams.get("status");
  return {
    bettor: view === "all" ? (searchParams.get("bettor") ?? "") : "",
    market: searchParams.get("strike") ?? "all",
    status: requestedStatus && historyStatusFilters.has(requestedStatus) ? requestedStatus : "open",
  };
};

export const BettingHistory = ({
  view,
  isAuthenticated,
  authLoading,
  onLogin,
  myBets,
  allBets,
  predictionMarketGroups,
  predictionMarketStates,
  countryByPlayer,
  loading,
  error,
}: BettingHistoryProps) => {
  const [returnDisplay, setReturnDisplay] = usePersistedState(
    "betting.history.returnDisplay",
    returnDisplaySchema,
    "pnl",
  );
  const [filters, setFilters] = useState(() =>
    historyFiltersFromSearch(view, typeof window === "undefined" ? "" : window.location.search),
  );
  const marketOptions = useMemo(() => {
    const options = new Map<string, string>();
    const stateByMarketId = new Map(
      predictionMarketStates.map((state) => [state.market.id, state]),
    );
    const resolvedOnly = filters.status === "resolved";
    const marketsWithBets = new Set([...allBets, ...myBets].map((bet) => bet.marketId));

    for (const group of predictionMarketGroups) {
      if (group.id.includes("shield")) continue;
      for (const market of sortPredictionMarketsByChance(group.markets, stateByMarketId)) {
        const state = stateByMarketId.get(market.id);
        if (resolvedOnly && state?.market.status !== "resolved") continue;
        if (
          filters.status === "open" &&
          state &&
          ["resolved", "refunded"].includes(state.market.status)
        )
          continue;
        if (
          state &&
          state.market.status !== "open" &&
          state.market.sportsbookVolumeCoins <= 0 &&
          state.market.exchangeVolumeCoins <= 0 &&
          state.fills.length === 0 &&
          !marketsWithBets.has(market.id)
        )
          continue;
        const strike = market.outcomeLabels
          ? `${market.outcomeLabels.yes} vs ${market.outcomeLabels.no}`
          : market.username;
        options.set(market.id, `${group.title} · ${strike}`);
      }
    }

    return [...options].map(([id, label]) => ({ id, label }));
  }, [allBets, filters.status, myBets, predictionMarketGroups, predictionMarketStates]);
  const mine = view === "mine";
  const bets = mine ? myBets : allBets;
  const visibleBets = useMemo(
    () =>
      filterHistoryBets({
        bets,
        status: filters.status,
        marketId: filters.market,
        bettor: mine ? "" : filters.bettor,
      }),
    [bets, filters, mine],
  );
  const filtersActive =
    filters.status !== "all" || filters.market !== "all" || (!mine && filters.bettor.trim());

  useEffect(() => {
    if (view !== "all") return;
    const nextUrl = new URL(window.location.href);
    const setOrDelete = (key: string, value: string, defaultValue: string) => {
      if (value === defaultValue) nextUrl.searchParams.delete(key);
      else nextUrl.searchParams.set(key, value);
    };
    setOrDelete("bettor", filters.bettor.trim(), "");
    setOrDelete("strike", filters.market, "all");
    setOrDelete("status", filters.status, "open");
    window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }, [filters, view]);

  useEffect(() => {
    if (filters.market === "all") return;
    if (marketOptions.some((market) => market.id === filters.market)) return;
    setFilters((current) => ({ ...current, market: "all" }));
  }, [filters.market, marketOptions]);

  const setFilter = (name: keyof HistoryFilters, value: string) => {
    setFilters((current) => ({ ...current, [name]: value }));
  };

  let content;
  if (mine && !isAuthenticated) {
    content = (
      <div className="bettingLoginPrompt">
        <h2>Log in to view your bets</h2>
        <button type="button" disabled={authLoading} onClick={onLogin}>
          Log in with Lichess
        </button>
      </div>
    );
  } else if (error) {
    content = (
      <InlineState kind="error">
        {getErrorMessage(error, mine ? "Unable to load your bets." : "Unable to load all bets.")}
      </InlineState>
    );
  } else if (loading) {
    content = <RouteLoadingFallback />;
  } else {
    content = (
      <BetHistoryTable
        returnDisplay={returnDisplay}
        bets={visibleBets}
        countryByPlayer={countryByPlayer}
        emptyMessage={
          filtersActive
            ? "No bets match these filters."
            : mine
              ? "You have not placed any bets."
              : "No bets have been placed yet."
        }
        showUsername={!mine}
      />
    );
  }

  return (
    <section className="bettingHistory" role="tabpanel">
      <div className="betHistoryFilters" aria-label="Bet filters">
        {view === "all" ? (
          <label className="betHistoryBettorFilter">
            <span>Bettor</span>
            <div>
              <input
                id="all-bets-bettor"
                type="text"
                value={filters.bettor}
                onChange={(event) => setFilter("bettor", event.target.value)}
                placeholder="username"
                autoComplete="off"
                maxLength={100}
              />
              {filters.bettor ? (
                <button type="button" onClick={() => setFilter("bettor", "")}>
                  Clear
                </button>
              ) : null}
            </div>
          </label>
        ) : null}
        <label className="betHistoryMarketFilter">
          <span>Market</span>
          <select
            value={filters.market}
            onChange={(event) => setFilter("market", event.target.value)}
          >
            <option value="all">All market strikes</option>
            {marketOptions.map((market) => (
              <option key={market.id} value={market.id}>
                {market.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={filters.status}
            onChange={(event) => setFilter("status", event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        <label>
          <span>Display</span>
          <select
            value={returnDisplay}
            onChange={(event) => setReturnDisplay(returnDisplaySchema.parse(event.target.value))}
          >
            <option value="return">Return</option>
            <option value="pnl">P&amp;L</option>
          </select>
        </label>
      </div>
      {content}
    </section>
  );
};
