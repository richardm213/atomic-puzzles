import "./Users.css";

import { faCircleInfo, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";

import { DataTable } from "../../components/DataTable/DataTable";
import { SortableTableHeader } from "../../components/DataTable/SortableTableHeader";
import { InlineState } from "../../components/InlineState/InlineState";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useTableSort } from "../../hooks/useTableSort";
import type { AliasIdentityRow } from "../../lib/archive/aliases";
import { aliasRowsQueryOptions } from "../../lib/users/aliasQueries";

type BannedUserSortKey = "username" | "accounts";
const bannedUserColumns = [
  { key: "username", label: "Username" },
  { key: "accounts", label: "Banned Accounts" },
] satisfies Array<{ key: BannedUserSortKey; label: string }>;
type BannedUserRow = { username: string; accounts: string[] };
const emptyBannedUserRows: BannedUserRow[] = [];

const buildBannedRows = (aliasRows: AliasIdentityRow[]): BannedUserRow[] =>
  aliasRows
    .map((row) => {
      const username = String(row?.username || "").trim();
      const accounts = [
        ...new Set(
          row.accounts
            .filter((account) => Boolean(account?.banned))
            .map((account) => String(account.displayAlias || account.alias || "").trim())
            .filter(Boolean),
        ),
      ];

      return { username, accounts };
    })
    .filter((row) => row.username && row.accounts.length > 0);

export const BannedUsersPage = () => {
  const { changeSort, sortDirection, sortKey } = useTableSort<BannedUserSortKey>({
    initialKey: "username",
    initialDirection: "asc",
    getDefaultDirection: () => "asc",
  });
  const bannedUsersQuery = useQuery(aliasRowsQueryOptions());
  const rows = bannedUsersQuery.data ? buildBannedRows(bannedUsersQuery.data) : emptyBannedUserRows;
  const loading = bannedUsersQuery.isPending;
  const error = bannedUsersQuery.error
    ? bannedUsersQuery.error instanceof Error
      ? bannedUsersQuery.error.message
      : "Failed to load banned users."
    : "";

  const sortedRows = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {
      if (sortKey === "accounts") {
        const aliasCompare =
          directionMultiplier * a.accounts.join(", ").localeCompare(b.accounts.join(", "));
        if (aliasCompare !== 0) return aliasCompare;
      } else {
        const usernameCompare = directionMultiplier * a.username.localeCompare(b.username);
        if (usernameCompare !== 0) return usernameCompare;
      }

      return a.username.localeCompare(b.username);
    });
  }, [rows, sortDirection, sortKey]);

  const aliasTotal = useMemo(
    () => rows.reduce((total, row) => total + row.accounts.length, 0),
    [rows],
  );

  if (loading && rows.length === 0) return <RouteLoadingFallback />;

  return (
    <div className="rankingsPage">
      <Seo
        title="Banned Accounts"
        description="Browse canonical users with banned account rows."
        path="/users/banned"
      />
      <div className="panel rankingsPanel usersPanel bannedUsersPanel">
        <h1>Banned Accounts</h1>

        {error ? <InlineState kind="error">{error}</InlineState> : null}

        <div className="bannedUsersHero">
          <span className="bannedUsersHeroIcon" aria-hidden="true">
            <FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" />
          </span>
          <div className="bannedUsersHeroCopy">
            <span className="bannedUsersEyebrow">Fair play exclusions</span>
            <p>
              Accounts listed here are omitted from Atomic Puzzles ratings if they were banned by
              Lichess or deemed highly suspicious.
            </p>
          </div>
          <div className="bannedUsersHeroStats" aria-label="Banned user list summary">
            <span className="bannedUsersStat">
              <strong>{loading ? "..." : rows.length}</strong>
              <span>Users</span>
            </span>
            <span className="bannedUsersStat">
              <strong>{loading ? "..." : aliasTotal}</strong>
              <span>Accounts</span>
            </span>
            <Link className="rankingsMetaLink" to="/users">
              Back to full user list
            </Link>
          </div>
        </div>

        <div className="usersHelpCallout bannedUsersHelpCallout">
          <span className="usersHelpLabel">Why am I excluded?</span>
          <span className="usersHelpTooltip">
            <button
              type="button"
              className="usersHelpButton"
              aria-label="Why excluded users are omitted"
            >
              <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
            </button>
            <span className="usersHelpTooltipBubble" role="tooltip">
              It&apos;s nothing personal. If your account was banned by Lichess or deemed highly
              suspicious, I won&apos;t include it in the rating system.
            </span>
          </span>
        </div>

        {!error && !loading && rows.length === 0 ? (
          <InlineState kind="empty">No banned users available.</InlineState>
        ) : null}

        {!error && !loading && rows.length > 0 ? (
          <DataTable
            wrapperClassName="rankingsTableWrap"
            className="rankingsTable bannedUsersTable"
          >
            <thead>
              <tr>
                {bannedUserColumns.map((column) => (
                  <SortableTableHeader
                    key={column.key}
                    active={sortKey === column.key}
                    direction={sortDirection}
                    label={column.label}
                    onSort={() => changeSort(column.key)}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.username}>
                  <td>
                    <span className="bannedUserName">
                      <Link
                        className="rankingLink"
                        to="/@/$username"
                        params={{ username: row.username }}
                      >
                        {row.username}
                      </Link>
                    </span>
                  </td>
                  <td>
                    {row.accounts.length > 0 ? (
                      <div
                        className="bannedAliasTags"
                        aria-label={`${row.username} banned accounts`}
                      >
                        {row.accounts.map((alias) => (
                          <span key={`${row.username}-${alias}`} className="bannedAliasTag">
                            {alias}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : null}
      </div>
    </div>
  );
};
