import "./CoinRankings.css";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { DataTable } from "../../components/DataTable/DataTable";
import { InlineState } from "../../components/InlineState/InlineState";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import {
  coinRankingsQueryOptions,
  coinTransactionsQueryOptions,
} from "../../lib/coins/coinQueries";
import type { CoinTransaction, CoinTransactionReason } from "../../lib/coins/coins";
import { appAssetPath } from "../../utils/appAssetPath";
import { formatLocalDateTime } from "../../utils/formatters";

type CoinView = "rankings" | "transactions";
type TransactionCategory = "gifts" | "solves" | "submissions" | "purchases" | "bonuses";

const filterStorageKey = "atomic-puzzles.coin-transaction-filters";
const transactionFilters: { key: TransactionCategory; label: string }[] = [
  { key: "gifts", label: "Gifts" },
  { key: "solves", label: "Puzzle solves" },
  { key: "submissions", label: "Puzzle submissions" },
  { key: "purchases", label: "Shop purchases" },
  { key: "bonuses", label: "Daily bonuses" },
];
const allTransactionCategories = transactionFilters.map(({ key }) => key);

const reasonCategory: Record<CoinTransactionReason, TransactionCategory> = {
  coin_transfer: "gifts",
  puzzle_correct: "solves",
  puzzle_attempted: "solves",
  puzzle_created: "submissions",
  shop_redemption: "purchases",
  daily_bonus: "bonuses",
};

const shopItemLabels: Record<string, string> = {
  atomicdb_analysis_12h: "AtomicDB analysis",
  discord_nitro_month: "Discord Nitro",
  discord_nitro_year: "Discord Nitro",
  flowers_500: "flowers",
  lichess_patron_month: "Lichess Patron",
  next_prize_tournament_format: "tournament format",
};

const metadataString = (transaction: CoinTransaction, key: string): string => {
  const value = transaction.metadata[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
};

const transactionDescription = (transaction: CoinTransaction) => {
  const puzzleId = metadataString(transaction, "puzzleId");
  if (transaction.reason === "coin_transfer") {
    const otherPlayer = metadataString(
      transaction,
      transaction.amount < 0 ? "recipient" : "sender",
    );
    return otherPlayer
      ? `${transaction.amount < 0 ? "Gifted coins to" : "Received coins from"} ${otherPlayer}`
      : transaction.amount < 0
        ? "Sent a coin gift"
        : "Received a coin gift";
  }
  if (transaction.reason === "puzzle_correct") {
    return puzzleId ? `Solved puzzle #${puzzleId}` : "Solved a puzzle";
  }
  if (transaction.reason === "puzzle_attempted") return "Solved a puzzle";
  if (transaction.reason === "puzzle_created") {
    return puzzleId ? `Submitted puzzle #${puzzleId}` : "Submitted a puzzle";
  }
  if (transaction.reason === "shop_redemption") {
    const itemKey = metadataString(transaction, "itemKey");
    return `Purchased ${shopItemLabels[itemKey] ?? "a shop item"}`;
  }
  return "Claimed daily bonus";
};

const readSavedFilters = (): TransactionCategory[] => {
  if (typeof window === "undefined") return allTransactionCategories;
  try {
    const saved = JSON.parse(window.localStorage.getItem(filterStorageKey) ?? "null");
    if (!Array.isArray(saved)) return allTransactionCategories;
    return allTransactionCategories.filter((category) => saved.includes(category));
  } catch {
    return allTransactionCategories;
  }
};

export const CoinRankingsPage = () => {
  const [view, setView] = useState<CoinView>("rankings");
  const [selectedCategories, setSelectedCategories] =
    useState<TransactionCategory[]>(readSavedFilters);
  const rankingsQuery = useQuery(coinRankingsQueryOptions());
  const transactionsQuery = useQuery({
    ...coinTransactionsQueryOptions(),
    enabled: view === "transactions",
  });
  const rankings = rankingsQuery.data ?? [];
  const transactions = useMemo(() => transactionsQuery.data ?? [], [transactionsQuery.data]);
  const filteredTransactions = useMemo(
    () =>
      transactions.filter((transaction) =>
        selectedCategories.includes(reasonCategory[transaction.reason]),
      ),
    [selectedCategories, transactions],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(filterStorageKey, JSON.stringify(selectedCategories));
    } catch {
      // Filtering still works when storage is unavailable.
    }
  }, [selectedCategories]);

  if (rankingsQuery.isPending && rankings.length === 0) return <RouteLoadingFallback />;

  const rankingsError = rankingsQuery.error
    ? rankingsQuery.error instanceof Error
      ? rankingsQuery.error.message
      : "Unable to load coin rankings."
    : "";
  const transactionsError = transactionsQuery.error
    ? transactionsQuery.error instanceof Error
      ? transactionsQuery.error.message
      : "Unable to load coin transactions."
    : "";

  const toggleCategory = (category: TransactionCategory, checked: boolean) => {
    setSelectedCategories((current) =>
      checked ? [...current, category] : current.filter((entry) => entry !== category),
    );
  };

  return (
    <div className="rankingsPage">
      <Seo
        title="Coin rankings"
        description="See Atomic Coin balances and recent transactions for Atomic Puzzles players."
        path="/rankings/coins"
      />
      <div className="panel rankingsPanel coinRankingsPanel">
        <h1 className="coinRankingsTitle">
          <img src={appAssetPath("/images/coins/gold-coin-stack-v2.png")} alt="" />
          Coin Rankings
        </h1>

        <div className="coinRankingsViewTabs" role="tablist" aria-label="Coin activity view">
          <button
            type="button"
            role="tab"
            aria-selected={view === "rankings"}
            aria-controls="coin-rankings-view"
            onClick={() => setView("rankings")}
          >
            Rankings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "transactions"}
            aria-controls="coin-transactions-view"
            onClick={() => setView("transactions")}
          >
            Transactions
          </button>
        </div>

        {view === "rankings" ? (
          <section id="coin-rankings-view" role="tabpanel">
            {rankingsError ? <InlineState kind="error">{rankingsError}</InlineState> : null}

            {!rankingsError && rankings.length === 0 ? (
              <InlineState kind="empty">No coin balances are available yet.</InlineState>
            ) : null}

            {!rankingsError && rankings.length > 0 ? (
              <>
                <div className="rankingsMeta coinRankingsMeta">
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
          </section>
        ) : (
          <section id="coin-transactions-view" role="tabpanel">
            <fieldset className="coinTransactionFilters">
              <legend>Show transactions</legend>
              <div>
                {transactionFilters.map((filter) => (
                  <label key={filter.key}>
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(filter.key)}
                      onChange={(event) => toggleCategory(filter.key, event.target.checked)}
                    />
                    {filter.label}
                  </label>
                ))}
              </div>
            </fieldset>

            {transactionsQuery.isPending ? (
              <InlineState role="status">Loading transactions…</InlineState>
            ) : null}
            {transactionsError ? <InlineState kind="error">{transactionsError}</InlineState> : null}
            {!transactionsQuery.isPending && !transactionsError && transactions.length === 0 ? (
              <InlineState kind="empty">No coin transactions are available yet.</InlineState>
            ) : null}
            {!transactionsQuery.isPending &&
            !transactionsError &&
            transactions.length > 0 &&
            filteredTransactions.length === 0 ? (
              <InlineState kind="empty">No transactions match the selected filters.</InlineState>
            ) : null}

            {!transactionsError && filteredTransactions.length > 0 ? (
              <DataTable
                wrapperClassName="rankingsTableWrap coinRankingsTableWrap"
                className="rankingsTable coinTransactionsTable"
              >
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Activity</th>
                    <th scope="col">Date</th>
                    <th scope="col">Coins</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((transaction) => (
                    <tr key={transaction.id}>
                      <td>
                        <Link
                          className="rankingLink"
                          to="/@/$username"
                          params={{ username: transaction.username }}
                        >
                          {transaction.username}
                        </Link>
                      </td>
                      <td>{transactionDescription(transaction)}</td>
                      <td>
                        <time dateTime={transaction.createdAt}>
                          {formatLocalDateTime(transaction.createdAt)}
                        </time>
                      </td>
                      <td
                        className={`coinTransactionAmount ${
                          transaction.amount > 0 ? "isPositive" : "isNegative"
                        }`}
                      >
                        {transaction.amount > 0 ? "+" : ""}
                        {transaction.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
};
