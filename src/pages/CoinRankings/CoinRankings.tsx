import "./CoinRankings.css";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { DataTable } from "../../components/DataTable/DataTable";
import { InlineState } from "../../components/InlineState/InlineState";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { coinRankingsQueryOptions } from "../../lib/coins/coinQueries";

export const CoinRankingsPage = () => {
  const rankingsQuery = useQuery(coinRankingsQueryOptions());
  const rankings = rankingsQuery.data ?? [];

  if (rankingsQuery.isPending && rankings.length === 0) return <RouteLoadingFallback />;

  const error = rankingsQuery.error
    ? rankingsQuery.error instanceof Error
      ? rankingsQuery.error.message
      : "Unable to load coin rankings."
    : "";

  return (
    <div className="rankingsPage">
      <Seo
        title="Coin rankings"
        description="See Atomic Coin balances for Atomic Puzzles players."
        path="/rankings/coins"
      />
      <div className="panel rankingsPanel coinRankingsPanel">
        <h1>Coin Rankings</h1>

        {error ? <InlineState kind="error">{error}</InlineState> : null}

        {!error && rankings.length === 0 ? (
          <InlineState kind="empty">No coin balances are available yet.</InlineState>
        ) : null}

        {!error && rankings.length > 0 ? (
          <>
            <div className="rankingsMeta coinRankingsMeta">
              <span>{rankings.length.toLocaleString()} players</span>
              <Link className="rankingsMetaLink" to="/shop/how-coins-work">
                How coins work
              </Link>
            </div>

            <DataTable
              wrapperClassName="rankingsTableWrap coinRankingsTableWrap"
              className="rankingsTable coinRankingsTable"
            >
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">Coins</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((entry, index) => (
                  <tr key={entry.username}>
                    <td className="coinRankPosition">{index + 1}</td>
                    <td>
                      <Link
                        className="rankingLink"
                        to="/@/$username"
                        params={{ username: entry.username }}
                      >
                        {entry.username}
                      </Link>
                    </td>
                    <td className="coinBalance">{entry.balance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </>
        ) : null}
      </div>
    </div>
  );
};
