import "./BettorProfile.css";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import type { BettorProfile } from "../../../shared/domain/bettorProfile";
import { DataTable } from "../../components/DataTable/DataTable";
import { InlineState } from "../../components/InlineState/InlineState";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { formatCoinValue, formatSignedCoinValue } from "../../lib/coins/coinDisplay";
import { bettorProfileQueryOptions } from "../../lib/predictionMarkets/predictionMarketQueries";
import { getErrorMessage } from "../../utils/errors";
import { formatCalendarDate } from "../../utils/formatters";
import { BettorPnlChart } from "./BettorPnlChart";

const activityPageSize = 25;

const MarketCell = ({
  profile,
  marketId,
  outcome,
}: {
  profile: BettorProfile;
  marketId: string;
  outcome: "yes" | "no" | null;
}) => {
  const market = profile.markets[marketId];
  const title = market?.title || marketId;
  const path = market?.path;
  return (
    <td className="bettorMarketCell">
      {path && /^\/betting\/[a-z0-9-]+$/.test(path) ? (
        <a href={`${path}?market=${encodeURIComponent(marketId)}`}>{title}</a>
      ) : (
        title
      )}
      {outcome && market ? <small>{market[outcome]}</small> : null}
    </td>
  );
};

const BettorActivity = ({ profile }: { profile: BettorProfile }) => {
  const [view, setView] = useState<"positions" | "history">("positions");
  const [page, setPage] = useState(1);
  const pageCount = Math.ceil(profile.settledBets.length / activityPageSize);
  const currentPage = Math.max(1, Math.min(page, pageCount));
  const bets = profile.settledBets.slice(
    (currentPage - 1) * activityPageSize,
    currentPage * activityPageSize,
  );
  return (
    <section className="bettorPanel bettorActivity" aria-label="Bets and positions">
      <div className="bettorViewOptions" role="group" aria-label="Bettor activity views">
        <button
          type="button"
          aria-pressed={view === "positions"}
          onClick={() => setView("positions")}
        >
          Open positions <span>{profile.openPositions.length}</span>
        </button>
        <button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}>
          Bet history <span>{profile.settledBets.length}</span>
        </button>
      </div>
      {view === "positions" ? (
        profile.openPositions.length ? (
          <DataTable className="bettorTable">
            <caption className="visuallyHidden">Open positions</caption>
            <thead>
              <tr>
                <th scope="col">Market</th>
                <th scope="col">Contracts</th>
                <th scope="col">Cost</th>
              </tr>
            </thead>
            <tbody>
              {profile.openPositions.map((position) => (
                <tr key={`${position.marketId}:${position.outcome}`}>
                  <MarketCell
                    profile={profile}
                    marketId={position.marketId}
                    outcome={position.outcome}
                  />
                  <td className="bettorNumeric">{formatCoinValue(position.quantity)}</td>
                  <td className="bettorNumeric">{formatCoinValue(position.cost)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <InlineState kind="empty">No open positions.</InlineState>
        )
      ) : bets.length ? (
        <>
          <DataTable className="bettorTable">
            <caption className="visuallyHidden">Settled bets</caption>
            <thead>
              <tr>
                <th scope="col">Market</th>
                <th scope="col">Settled</th>
                <th scope="col">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {bets.map((bet) => (
                <tr key={bet.marketId}>
                  <MarketCell profile={profile} marketId={bet.marketId} outcome={bet.outcome} />
                  <td>
                    <time dateTime={bet.settledAt}>
                      {formatCalendarDate(bet.settledAt.slice(0, 10))}
                    </time>
                    {bet.status === "refunded" ? (
                      <small className="bettorRowDetail">Refunded</small>
                    ) : null}
                  </td>
                  <td className="bettorNumeric" data-pnl={Math.sign(bet.pnl)}>
                    {formatSignedCoinValue(bet.pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
          {pageCount > 1 ? (
            <PaginationRow
              ariaLabel="Bet history pages"
              currentPage={currentPage}
              totalPages={pageCount}
              onPageChange={setPage}
            />
          ) : null}
        </>
      ) : (
        <InlineState kind="empty">No settled bets.</InlineState>
      )}
    </section>
  );
};

export const BettorProfilePage = ({ username }: { username: string }) => {
  const account = username.trim().toLowerCase();
  const profileQuery = useQuery(bettorProfileQueryOptions(account));
  const profile = profileQuery.data;
  return (
    <div className="bettorProfilePage">
      <Seo
        title={`${account} · Bettor profile`}
        description={`View ${account}’s betting performance on Atomic Puzzles.`}
        path={`/@/${encodeURIComponent(account)}/betting`}
      />
      <header className="bettorHeader">
        <Link to="/betting">← Betting</Link>
        <div>
          <h1>{account}</h1>
          <Link to="/@/$username" params={{ username: account }}>
            Player profile
          </Link>
        </div>
      </header>
      {profileQuery.isPending ? (
        <RouteLoadingFallback />
      ) : !profile ? (
        <InlineState kind="error">
          {getErrorMessage(profileQuery.error, "Unable to load this bettor profile.")}
        </InlineState>
      ) : (
        <>
          <div className="bettorSummary bettorPanel">
            <section className="bettorPerformance" aria-labelledby="bettor-performance-title">
              <h2 id="bettor-performance-title">Realized P&amp;L</h2>
              <BettorPnlChart history={profile.pnlByDay} realizedPnl={profile.realizedPnl} />
            </section>
            <section className="bettorWorth" aria-labelledby="bettor-worth-title">
              <h2 id="bettor-worth-title">Net worth</h2>
              <p className="bettorHeadline">
                {formatCoinValue(profile.netWorth)} <small>coins</small>
              </p>
              <dl className="bettorStatList">
                <div>
                  <dt>Coin balance</dt>
                  <dd>{formatCoinValue(profile.balance)}</dd>
                </div>
                <div>
                  <dt>Open positions at cost</dt>
                  <dd>{formatCoinValue(profile.openCost)}</dd>
                </div>
              </dl>
              <h3>Puzzle earnings · all time</h3>
              <dl className="bettorStatList">
                <div>
                  <dt>Puzzles solved</dt>
                  <dd>{formatCoinValue(profile.puzzleSolveCoins)}</dd>
                </div>
                <div>
                  <dt>Puzzles created</dt>
                  <dd>{formatCoinValue(profile.puzzleCreationCoins)}</dd>
                </div>
              </dl>
              <dl className="bettorStatList bettorSpending">
                <div>
                  <dt>Coins spent</dt>
                  <dd>{formatSignedCoinValue(profile.coinsSpent)}</dd>
                </div>
              </dl>
            </section>
          </div>
          <BettorActivity profile={profile} />
        </>
      )}
    </div>
  );
};
