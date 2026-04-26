import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Seo } from "../../components/Seo/Seo";
import { modeOptions } from "../../constants/matches";
import { loadAliasesLookup } from "../../lib/users/aliasesLookup";
import { fetchPlayerRatingsRows } from "../../lib/supabase/supabasePlayerRatings";
import "./Users.css";

const HIGH_RD_THRESHOLD = 100;
const ratingDisplayOptions = ["current", "peak"];

const getUserColumns = (ratingDisplayMode) => [
  { key: "username", label: "Username" },
  {
    key: "blitz",
    label: `Blitz ${ratingDisplayMode === "peak" ? "Peak" : "Rating"}`,
  },
  {
    key: "bullet",
    label: `Bullet ${ratingDisplayMode === "peak" ? "Peak" : "Rating"}`,
  },
  {
    key: "hyperbullet",
    label: `Hyper ${ratingDisplayMode === "peak" ? "Peak" : "Rating"}`,
  },
  { key: "aliasCount", label: "Number of Aliases" },
];

const roundToTenth = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : null;
};

const normalizeRatingCell = (ratingValue, rdValue, hideForHighRd = true) => {
  const rating = roundToTenth(ratingValue);
  const rd = Number(rdValue);
  const hidden = !Number.isFinite(rating) || (hideForHighRd && Number.isFinite(rd) && rd >= HIGH_RD_THRESHOLD);

  return {
    display: hidden ? "?" : rating,
    sortValue: hidden ? null : rating,
  };
};

const normalizeRatingCells = (row) => {
  const rd = Number(row?.rd);

  return {
    current: normalizeRatingCell(row?.rating, rd, true),
    peak: normalizeRatingCell(row?.peak, rd, false),
  };
};

const sortIndicator = (sortKey, sortDirection, columnKey) => {
  if (sortKey !== columnKey) return "";
  return sortDirection === "asc" ? "↑" : "↓";
};

const compareNullableNumbers = (a, b, directionMultiplier) => {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;

  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (a === b) return 0;
  return directionMultiplier * (a - b);
};

const buildUserRows = (ratingRows, aliasesLookup) => {
  const rowsByUsername = new Map();

  (Array.isArray(ratingRows) ? ratingRows : []).forEach((row) => {
    const username = String(row?.username || "").trim();
    const mode = String(row?.tc || "").toLowerCase();
    if (!username || !modeOptions.includes(mode)) return;

    const emptyRatingCells = {
      current: { display: "?", sortValue: null },
      peak: { display: "?", sortValue: null },
    };

    const existing = rowsByUsername.get(username) ?? {
      username,
      blitz: emptyRatingCells,
      bullet: emptyRatingCells,
      hyperbullet: emptyRatingCells,
      aliasCount: aliasesLookup.get(username)?.aliases?.length ?? 0,
      aliases: aliasesLookup.get(username)?.aliases ?? [],
    };

    existing[mode] = normalizeRatingCells(row);
    existing.aliasCount = aliasesLookup.get(username)?.aliases?.length ?? existing.aliasCount ?? 0;
    existing.aliases = aliasesLookup.get(username)?.aliases ?? existing.aliases ?? [];
    rowsByUsername.set(username, existing);
  });

  return [...rowsByUsername.values()];
};

const UsersTablePage = () => {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState("aliasCount");
  const [sortDirection, setSortDirection] = useState("desc");
  const [ratingDisplayMode, setRatingDisplayMode] = useState("current");

  useEffect(() => {
    let isCurrent = true;

    const loadUsers = async () => {
      setLoading(true);
      setError("");

      try {
        const [ratingRows, aliasesLookup] = await Promise.all([
          fetchPlayerRatingsRows(),
          loadAliasesLookup(),
        ]);
        if (!isCurrent) return;

        setRows(buildUserRows(ratingRows, aliasesLookup));
      } catch (loadError) {
        if (!isCurrent) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load users.");
        setRows([]);
      } finally {
        if (isCurrent) setLoading(false);
      }
    };

    loadUsers();

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
    setSortDirection(nextKey === "username" ? "asc" : "desc");
  };

  const sortedRows = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    return [...rows].sort((a, b) => {
      if (sortKey === "username") {
        const usernameCompare = directionMultiplier * a.username.localeCompare(b.username);
        if (usernameCompare !== 0) return usernameCompare;
        return a.aliasCount - b.aliasCount;
      }

      if (sortKey === "aliasCount") {
        const aliasCompare = compareNullableNumbers(
          a.aliasCount,
          b.aliasCount,
          directionMultiplier,
        );
        if (aliasCompare !== 0) return aliasCompare;
        return a.username.localeCompare(b.username);
      }

      const ratingCompare = compareNullableNumbers(
        a[sortKey]?.[ratingDisplayMode]?.sortValue,
        b[sortKey]?.[ratingDisplayMode]?.sortValue,
        directionMultiplier,
      );
      if (ratingCompare !== 0) return ratingCompare;

      return a.username.localeCompare(b.username);
    });
  }, [ratingDisplayMode, rows, sortDirection, sortKey]);

  const userColumns = useMemo(() => getUserColumns(ratingDisplayMode), [ratingDisplayMode]);

  return (
    <div className="rankingsPage">
      <Seo
        title="Atomic User List"
        description="Browse the full atomic user list with blitz, bullet, hyperbullet, and alias counts."
        path="/users"
      />
      <div className="panel rankingsPanel usersPanel">
        <h1>Full User List</h1>

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta usersMeta">
          <span>{loading ? "Loading users..." : `${rows.length} users`}</span>
          <span className="rankedCount">
            <Link className="rankingsMetaLink" to="/users/banned">
              Banned user list
            </Link>
            <Link className="rankingsMetaLink" to="/rankings">
              Back to rankings
            </Link>
          </span>
        </div>

        <div className="usersToolbar" aria-label="User list rating display mode">
          <span className="usersToolbarLabel">Ratings shown as</span>
          <div className="usersDisplayModeGroup" role="group" aria-label="Choose current or peak ratings">
            {ratingDisplayOptions.map((option) => (
              <button
                key={option}
                type="button"
                className={`usersDisplayModeButton${
                  ratingDisplayMode === option ? " usersDisplayModeButtonActive" : ""
                }`}
                aria-pressed={ratingDisplayMode === option}
                onClick={() => setRatingDisplayMode(option)}
              >
                {option === "peak" ? "Peak" : "Current"}
              </button>
            ))}
          </div>
        </div>

        <div className="usersHelpCallout">
          <span className="usersHelpLabel">Don&apos;t see yourself here?</span>
          <span className="usersHelpTooltip">
            <button
              type="button"
              className="usersHelpButton"
              aria-label="How to get added to the rating system"
            >
              <i className="fa-solid fa-circle-info" aria-hidden="true" />
            </button>
            <span className="usersHelpTooltipBubble" role="tooltip">
              Message <strong>seaside_tiramisu</strong> on Lichess to be added to the rating system.
              Your account should be at least six months old, unless you are genuinely new to
              atomic. If you are using a newer account but have played before, send your old
              accounts along with the new one.
            </span>
          </span>
        </div>

        {!error && loading ? <div className="emptyRankings">Loading user list...</div> : null}

        {!error && !loading && rows.length === 0 ? (
          <div className="emptyRankings">No users available.</div>
        ) : null}

        {!error && !loading && rows.length > 0 ? (
          <div className="rankingsTableWrap">
            <table className="rankingsTable usersTable">
              <thead>
                <tr>
                  {userColumns.map((column) => (
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
                    <td>{row.blitz[ratingDisplayMode].display}</td>
                    <td>{row.bullet[ratingDisplayMode].display}</td>
                    <td>{row.hyperbullet[ratingDisplayMode].display}</td>
                    <td>
                      {row.aliasCount > 0 ? (
                        <div className="usersAliasCell">
                          <span
                            className="usersAliasToggle"
                            tabIndex={0}
                            aria-controls={`user-aliases-${row.username}`}
                          >
                            <span>{row.aliasCount}</span>
                            <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                          </span>
                          <div id={`user-aliases-${row.username}`} className="usersAliasList">
                            {row.aliases.map((alias) => (
                              <span key={`${row.username}-${alias}`} className="usersAliasText">
                                {alias}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        0
                      )}
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

export const UsersPage = () => <UsersTablePage />;
