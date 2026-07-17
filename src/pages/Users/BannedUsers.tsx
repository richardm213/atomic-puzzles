import "./Users.css";

import { faCircleInfo, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import { type AliasIdentityRow, fetchAliasRows } from "../../lib/supabase/supabaseAliases";

const bannedUserColumns = [
  { key: "username", label: "Username" },
  { key: "accounts", label: "Banned Accounts" },
];

const sortIndicator = (
  sortKey: string,
  sortDirection: "asc" | "desc",
  columnKey: string,
): string => {
  if (sortKey !== columnKey) return "";
  return sortDirection === "asc" ? "↑" : "↓";
};

const buildBannedRows = (
  aliasRows: AliasIdentityRow[],
): Array<{ username: string; accounts: string[] }> =>
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
  const [rows, setRows] = useState<Array<{ username: string; accounts: string[] }>>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("username");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    let isCurrent = true;

    const loadBannedUsers = async () => {
      setLoading(true);
      setError("");

      try {
        const aliasRows = await fetchAliasRows();
        if (!isCurrent) return;
        setRows(buildBannedRows(aliasRows));
      } catch (loadError) {
        if (!isCurrent) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load banned users.");
        setRows([]);
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    void loadBannedUsers();

    return () => {
      isCurrent = false;
    };
  }, []);

  const handleSort = (nextKey: string): void => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  };

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

  return (
    <div className="rankingsPage">
      <Seo
        title="Banned Accounts"
        description="Browse canonical users with banned account rows."
        path="/users/banned"
      />
      <div className="panel rankingsPanel usersPanel bannedUsersPanel">
        <h1>Banned Accounts</h1>

        {error ? <div className="errorText">{error}</div> : null}

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

        {!error && loading ? (
          <div className="emptyRankings">Loading banned user list...</div>
        ) : null}

        {!error && !loading && rows.length === 0 ? (
          <div className="emptyRankings">No banned users available.</div>
        ) : null}

        {!error && !loading && rows.length > 0 ? (
          <div className="rankingsTableWrap">
            <table className="rankingsTable bannedUsersTable">
              <thead>
                <tr>
                  {bannedUserColumns.map((column) => (
                    <th key={column.key}>
                      <button
                        type="button"
                        className="sortButton"
                        onClick={() => handleSort(column.key)}
                      >
                        {column.label} {sortIndicator(sortKey, sortDirection, column.key)}
                      </button>
                    </th>
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
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
};
