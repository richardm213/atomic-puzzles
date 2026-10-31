import { useMemo, useState } from "react";

import { InlineState } from "../../components/InlineState/InlineState";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { useUnderscoreUsernameCutoff } from "../../hooks/useUnderscoreUsernameCutoff";
import type { BettingMarket } from "../../lib/betting/betting";
import { formatCoinValue } from "../../lib/coins/coinDisplay";
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
  countryByPlayer: Record<string, string>;
  myBetsLoading: boolean;
  allBetsLoading: boolean;
  myBetsError: unknown;
  allBetsError: unknown;
};

export const BettingHistory = ({
  view,
  isAuthenticated,
  authLoading,
  onLogin,
  myBets,
  allBets,
  markets,
  countryByPlayer,
  myBetsLoading,
  allBetsLoading,
  myBetsError,
  allBetsError,
}: BettingHistoryProps) => {
  const [bettorFilter, setBettorFilter] = useState("");
  const visibleAllBets = useMemo(() => {
    const filter = bettorFilter.trim().toLowerCase();
    return filter ? allBets.filter((bet) => bet.username.toLowerCase().includes(filter)) : allBets;
  }, [allBets, bettorFilter]);

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
        bets={myBets}
        markets={markets}
        countryByPlayer={countryByPlayer}
        emptyMessage="You have not placed any bets."
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
          bettorFilter.trim() ? "No bets match this bettor." : "No bets have been placed yet."
        }
        showUsername
      />
    );
  }

  return (
    <section className="bettingHistory" role="tabpanel">
      {view === "all" ? (
        <div className="betHistoryBettorFilter">
          <label htmlFor="all-bets-bettor">Bettor</label>
          <div>
            <input
              id="all-bets-bettor"
              type="text"
              value={bettorFilter}
              onChange={(event) => setBettorFilter(event.target.value)}
              placeholder="username"
              autoComplete="off"
              maxLength={100}
            />
            {bettorFilter ? (
              <button type="button" onClick={() => setBettorFilter("")}>
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {content}
    </section>
  );
};
