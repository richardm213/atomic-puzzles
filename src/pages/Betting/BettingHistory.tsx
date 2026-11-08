import { useEffect, useMemo, useState } from "react";
import { z } from "zod";

import { InlineState } from "../../components/InlineState/InlineState";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { usePersistedState } from "../../hooks/usePersistedState";
import { useUnderscoreUsernameCutoff } from "../../hooks/useUnderscoreUsernameCutoff";
import type { BettingMarket } from "../../lib/betting/betting";
import { formatCoinValue } from "../../lib/coins/coinDisplay";
import {
  type PredictionMarketGroup,
  type PredictionMarketState,
  sortPredictionMarketsByChance,
} from "../../lib/predictionMarkets/predictionMarkets";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { getErrorMessage } from "../../utils/errors";
import { formatLocalDateTime } from "../../utils/formatters";
import type { BetHistoryEntry } from "./bettingHistoryModel";

const abbreviateRound = (roundName: string): string => {
  const normalizedRound = roundName.trim().toLowerCase();
  const numberedRound = /^round of (\d+)$/.exec(normalizedRound);
  if (numberedRound) return `R${numberedRound[1]}`;
  if (normalizedRound === "quarterfinals" || normalizedRound === "quarterfinal") return "QF";
  if (normalizedRound === "semifinals" || normalizedRound === "semifinal") return "SF";
  if (normalizedRound === "finals" || normalizedRound === "final") return "F";
  return roundName;
};

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
      return (bet.status === "open" ? bet.potentialPayout : bet.payout) - bet.totalCost;
  }
};

export const BetHistoryTable = ({
  bets,
  markets,
  countryByPlayer,
  emptyMessage,
  showUsername = false,
  returnDisplay,
  priceLabel = "Price",
  showStatus = true,
  showMarket = true,
  sortable = false,
  showUnits = true,
}: {
  bets: BetHistoryEntry[];
  markets: BettingMarket[];
  countryByPlayer: Record<string, string>;
  emptyMessage: string;
  showUsername?: boolean;
  returnDisplay: ReturnDisplay;
  priceLabel?: string;
  showStatus?: boolean;
  showMarket?: boolean;
  sortable?: boolean;
  showUnits?: boolean;
}) => {
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
  const columnHeader = (column: BetSortColumn, label: string) => (
    <th
      scope="col"
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
    <div className={`betHistoryTableWrap${showUsername ? " betHistoryTableWrap--all" : ""}`}>
      <table className="betHistoryTable">
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
          {sortedBets.map((bet) => {
            const isPrediction = bet.kind === "prediction";
            const market = markets.find((candidate) => candidate.id === bet.marketId);
            const selectionLabel = bet.predictionSelectionLabel ?? bet.selection;
            const round =
              !isPrediction && market?.marketKind !== "outright"
                ? (market?.roundName ?? "AWC 2026")
                : "";
            const countryCode =
              bet.predictionSelectionCountryCode ??
              countryByPlayer[selectionLabel.toLowerCase()] ??
              "";
            const payout = bet.status === "open" ? bet.potentialPayout : bet.payout;
            const pnl = Math.round((payout - bet.totalCost) * 100) / 100 || 0;
            const showPnl = returnDisplay === "pnl";
            const result =
              showPnl || bet.status !== "open"
                ? pnl > 0
                  ? "gain"
                  : pnl < 0
                    ? "loss"
                    : undefined
                : undefined;
            return (
              <tr key={bet.historyKey ?? `${bet.kind ?? "tournament"}-${bet.id}`}>
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
                      <BetHistoryUsername
                        username={isPrediction ? selectionLabel.toLowerCase() : selectionLabel}
                      />
                      {isPrediction && bet.predictionOutcome && !bet.predictionSelectionLabel ? (
                        <span className="betHistoryOutcome">
                          · {bet.predictionOutcome === "yes" ? "Yes" : "No"}
                        </span>
                      ) : null}
                    </strong>
                  </span>
                  {showMarket ? (
                    <span className="betHistoryMarket">
                      {isPrediction
                        ? (bet.predictionMarketTitle ?? "Prediction market")
                        : market?.label || bet.marketId}
                      {round ? <small> · {abbreviateRound(round)}</small> : null}
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
                    {formatCoinValue(bet.priceCents)}
                    <span className="betHistoryPriceSuffix">%</span>
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
  );
};

type BettingHistoryProps = {
  view: "mine" | "all";
  isAuthenticated: boolean;
  authLoading: boolean;
  onLogin: () => void;
  myBets: BetHistoryEntry[];
  allBets: BetHistoryEntry[];
  markets: BettingMarket[];
  predictionMarketGroups: PredictionMarketGroup[];
  predictionMarketStates: PredictionMarketState[];
  countryByPlayer: Record<string, string>;
  myBetsLoading: boolean;
  allBetsLoading: boolean;
  myBetsError: unknown;
  allBetsError: unknown;
};

const historyStatusFilters = new Set(["all", "open", "resolved"]);

type HistoryFilters = {
  bettor: string;
  market: string;
  status: string;
};

const defaultHistoryFilters = (view: BettingHistoryProps["view"]): HistoryFilters => ({
  bettor: "",
  market: "all",
  status: view === "all" ? "open" : "all",
});

const historyFiltersFromSearch = (
  view: BettingHistoryProps["view"],
  search: string,
): HistoryFilters => {
  const defaults = defaultHistoryFilters(view);
  const searchParams = new URLSearchParams(search);
  const requestedStatus = searchParams.get("status");
  return {
    bettor: view === "all" ? (searchParams.get("bettor") ?? defaults.bettor) : "",
    market: searchParams.get("strike") ?? defaults.market,
    status:
      requestedStatus && historyStatusFilters.has(requestedStatus)
        ? requestedStatus
        : defaults.status,
  };
};

export const BettingHistory = ({
  view,
  isAuthenticated,
  authLoading,
  onLogin,
  myBets,
  allBets,
  markets,
  predictionMarketGroups,
  predictionMarketStates,
  countryByPlayer,
  myBetsLoading,
  allBetsLoading,
  myBetsError,
  allBetsError,
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

    for (const market of markets) {
      // Prediction catalog entries may also appear in the legacy market list.
      if (stateByMarketId.has(market.id)) continue;
      if (resolvedOnly && market.status !== "settled") continue;
      const settled = ["settled", "refunded"].includes(market.status);
      if (settled && (filters.status === "open" || !marketsWithBets.has(market.id))) continue;
      if (!options.has(market.id)) {
        options.set(market.id, `${market.roundName} · ${market.label}`);
      }
    }

    return [...options].map(([id, label]) => ({ id, label }));
  }, [allBets, filters.status, markets, myBets, predictionMarketGroups, predictionMarketStates]);
  const visibleMyBets = useMemo(
    () =>
      filterHistoryBets({
        bets: myBets,
        status: filters.status,
        marketId: filters.market,
      }),
    [filters.market, filters.status, myBets],
  );
  const visibleAllBets = useMemo(
    () =>
      filterHistoryBets({
        bets: allBets,
        status: filters.status,
        marketId: filters.market,
        bettor: filters.bettor,
      }),
    [allBets, filters.bettor, filters.market, filters.status],
  );
  const filtersActive = filters.status !== "all" || filters.market !== "all";

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
  if (view === "mine" && !isAuthenticated) {
    content = (
      <div className="bettingLoginPrompt">
        <h2>Log in to view your bets</h2>
        <button type="button" disabled={authLoading} onClick={onLogin}>
          Log in with Lichess
        </button>
      </div>
    );
  } else if (view === "mine" && myBetsError) {
    content = (
      <InlineState kind="error">
        {getErrorMessage(myBetsError, "Unable to load your bets.")}
      </InlineState>
    );
  } else if (view === "mine" && myBetsLoading) {
    content = <RouteLoadingFallback />;
  } else if (view === "mine") {
    content = (
      <BetHistoryTable
        returnDisplay={returnDisplay}
        bets={visibleMyBets}
        markets={markets}
        countryByPlayer={countryByPlayer}
        emptyMessage={
          filtersActive ? "No bets match these filters." : "You have not placed any bets."
        }
      />
    );
  } else if (allBetsError) {
    content = (
      <InlineState kind="error">
        {getErrorMessage(allBetsError, "Unable to load all bets.")}
      </InlineState>
    );
  } else if (allBetsLoading) {
    content = <RouteLoadingFallback />;
  } else {
    content = (
      <BetHistoryTable
        returnDisplay={returnDisplay}
        bets={visibleAllBets}
        markets={markets}
        countryByPlayer={countryByPlayer}
        emptyMessage={
          filters.bettor.trim() || filtersActive
            ? "No bets match these filters."
            : "No bets have been placed yet."
        }
        showUsername
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
