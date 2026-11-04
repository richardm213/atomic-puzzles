import { useEffect, useMemo, useState } from "react";

import { InlineState } from "../../components/InlineState/InlineState";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
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
  return bets.filter(
    (bet) =>
      (status === "all" || bet.status === status) &&
      (marketId === "all" || bet.marketId === marketId) &&
      (!normalizedBettor || bet.username.toLowerCase().includes(normalizedBettor)),
  );
};

const BetHistoryTable = ({
  bets,
  markets,
  countryByPlayer,
  emptyMessage,
  showUsername = false,
}: {
  bets: BetHistoryEntry[];
  markets: BettingMarket[];
  countryByPlayer: Record<string, string>;
  emptyMessage: string;
  showUsername?: boolean;
}) => {
  if (!bets.length) return <InlineState kind="empty">{emptyMessage}</InlineState>;

  return (
    <div className={`betHistoryTableWrap${showUsername ? " betHistoryTableWrap--all" : ""}`}>
      <table className="betHistoryTable">
        <caption className="betHistoryCaption">{showUsername ? "All bets" : "My bets"}</caption>
        <thead>
          <tr>
            <th scope="col">Selection</th>
            {showUsername ? <th scope="col">Bettor</th> : null}
            <th scope="col">Price</th>
            <th scope="col">Cost</th>
            <th scope="col">Return</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {bets.map((bet) => {
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
                  <span className="betHistoryMarket">
                    {isPrediction
                      ? (bet.predictionMarketTitle ?? "Prediction market")
                      : market?.label || bet.marketId}
                    {round ? <small> · {abbreviateRound(round)}</small> : null}
                  </span>
                </th>
                {showUsername ? (
                  <td className="betHistoryBettor" data-label="Bettor">
                    <BetHistoryBettorLink username={bet.username} />
                  </td>
                ) : null}
                <td className="betHistoryNumber" data-label="Price">
                  <strong>
                    {bet.priceCents}
                    <span className="betHistoryPriceSuffix">%</span>
                  </strong>
                </td>
                <td className="betHistoryNumber" data-label="Cost">
                  <strong>{formatCoinValue(bet.totalCost)}</strong>
                  <small>coins</small>
                </td>
                <td className="betHistoryNumber betHistoryReturn" data-label="Return">
                  <strong>{formatCoinValue(payout)}</strong>
                  <small>{bet.status === "open" ? "possible" : "paid"}</small>
                </td>
                <td className="betHistoryState" data-label="Status">
                  <span className={`betStatus betStatus--${bet.status}`}>
                    {bet.status === "open" ? "Open" : bet.status}
                  </span>
                  <time dateTime={bet.placedAt}>{formatLocalDateTime(bet.placedAt)}</time>
                </td>
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

const historyStatusFilters = new Set(["all", "open", "won", "lost", "settled", "refunded"]);

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
  const [filters, setFilters] = useState(() =>
    historyFiltersFromSearch(view, typeof window === "undefined" ? "" : window.location.search),
  );
  const marketOptions = useMemo(() => {
    const options = new Map<string, string>();
    const stateByMarketId = new Map(
      predictionMarketStates.map((state) => [state.market.id, state]),
    );

    for (const group of predictionMarketGroups) {
      if (group.id.includes("shield")) continue;
      for (const market of sortPredictionMarketsByChance(group.markets, stateByMarketId)) {
        const strike = market.outcomeLabels
          ? `${market.outcomeLabels.yes} vs ${market.outcomeLabels.no}`
          : market.username;
        options.set(market.id, `${group.title} · ${strike}`);
      }
    }

    for (const market of markets) {
      if (!options.has(market.id)) {
        options.set(market.id, `${market.roundName} · ${market.label}`);
      }
    }

    return [...options].map(([id, label]) => ({ id, label }));
  }, [markets, predictionMarketGroups, predictionMarketStates]);
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
            <option value="won">Won</option>
            <option value="lost">Lost</option>
            <option value="settled">Settled</option>
            <option value="refunded">Refunded</option>
          </select>
        </label>
      </div>
      {content}
    </section>
  );
};
