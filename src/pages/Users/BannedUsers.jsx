import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Seo } from "../../components/Seo/Seo";
import { fetchAliasRows } from "../../lib/supabaseAliases";
import "./Users.css";

const bannedUserColumns = [
  { key: "username", label: "Username" },
  { key: "aliases", label: "Aliases" },
];

const sortIndicator = (sortKey, sortDirection, columnKey) => {
  if (sortKey !== columnKey) return "";
  return sortDirection === "asc" ? "↑" : "↓";
};

const buildBannedRows = (aliasRows) =>
  (Array.isArray(aliasRows) ? aliasRows : [])
    .filter((row) => Boolean(row?.banned) && String(row?.username || "").trim())
    .map((row) => ({
      username: String(row.username).trim(),
      aliases: Array.isArray(row.aliases) ? row.aliases.filter(Boolean) : [],
    }));

export const BannedUsersPage = () => {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("username");
  const [sortDirection, setSortDirection] = useState("asc");

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

    loadBannedUsers();

    return () => {
      isCurrent = false;
    };
  }, []);

  const handleSort = (nextKey) => {
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
      if (sortKey === "aliases") {
        const aliasCompare =
          directionMultiplier * a.aliases.join(", ").localeCompare(b.aliases.join(", "));
        if (aliasCompare !== 0) return aliasCompare;
      } else {
        const usernameCompare = directionMultiplier * a.username.localeCompare(b.username);
        if (usernameCompare !== 0) return usernameCompare;
      }

      return a.username.localeCompare(b.username);
    });
  }, [rows, sortDirection, sortKey]);

  return (
    <div className="rankingsPage">
      <Seo
        title="Banned User List"
        description="Browse banned users and their known aliases."
        path="/users/banned"
      />
      <div className="panel rankingsPanel usersPanel">
        <h1>Banned User List</h1>

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta usersMeta">
          <span>{loading ? "Loading banned users..." : `${rows.length} banned users`}</span>
          <span className="rankedCount">
            <Link className="rankingsMetaLink" to="/users">
              Back to full user list
            </Link>
          </span>
        </div>

        <div className="usersHelpCallout">
          <span className="usersHelpLabel">Why am I banned?</span>
          <span className="usersHelpTooltip">
            <button
              type="button"
              className="usersHelpButton"
              aria-label="Why banned users are excluded"
            >
              <i className="fa-solid fa-circle-info" aria-hidden="true" />
            </button>
            <span className="usersHelpTooltipBubble" role="tooltip">
              It&apos;s nothing personal. If Lichess marked your account for a fair play violation,
              I won&apos;t include it in the rating system.
            </span>
          </span>
        </div>

        {!error && loading ? <div className="emptyRankings">Loading banned user list...</div> : null}

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
                      <Link
                        className="rankingLink"
                        to="/@/$username"
                        params={{ username: row.username }}
                      >
                        {row.username}
                      </Link>
                    </td>
                    <td>
                      {row.aliases.length > 0 ? row.aliases.join(", ") : "—"}
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
