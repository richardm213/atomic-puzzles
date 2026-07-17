import "./Users.css";

import { faChevronDown, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import { type Mode, modeOptions } from "../../constants/matches";
import {
  fetchPlayerRatingsRows,
  type PlayerRatingRow,
} from "../../lib/supabase/supabasePlayerRatings";
import { type AliasLookup, loadAliasesLookup } from "../../lib/users/aliasesLookup";
import { getOpeningDisplayLabel, normalizeOpeningKey } from "../../utils/openings";

const HIGH_RD_THRESHOLD = 100;
const RATING_DISPLAY_STORAGE_KEY = "atomic-users-rating-display-mode";
const ratingDisplayOptions = ["current", "peak"] as const;
type RatingDisplayMode = (typeof ratingDisplayOptions)[number];

type RatingCell = { display: string | number; sortValue: number | null };
type RatingCells = { current: RatingCell; peak: RatingCell };

type UserRow = {
  username: string;
  blitz: RatingCells;
  bullet: RatingCells;
  hyperbullet: RatingCells;
  wolfrandom: RatingCells;
  aliasCount: number;
  aliases: string[];
  openings: string[];
};

type UserSortKey = "username" | "openings" | "aliasCount" | Mode;

const isMode = (value: string): value is Mode => (modeOptions as readonly string[]).includes(value);

const isRatingDisplayMode = (value: string | null): value is RatingDisplayMode =>
  value === "current" || value === "peak";

const getStoredRatingDisplayMode = (): RatingDisplayMode => {
  if (typeof window === "undefined") return "current";

  try {
    const storedMode = window.localStorage.getItem(RATING_DISPLAY_STORAGE_KEY);
    return isRatingDisplayMode(storedMode) ? storedMode : "current";
  } catch {
    return "current";
  }
};

const getUserColumns = (
  ratingDisplayMode: RatingDisplayMode,
): Array<{ key: UserSortKey; label: string }> => [
  { key: "username", label: "Username" },
  { key: "blitz", label: `Blitz ${ratingDisplayMode === "peak" ? "Peak" : "Rating"}` },
  { key: "bullet", label: `Bullet ${ratingDisplayMode === "peak" ? "Peak" : "Rating"}` },
  { key: "hyperbullet", label: `Hyper ${ratingDisplayMode === "peak" ? "Peak" : "Rating"}` },
  {
    key: "wolfrandom",
    label: `Wolfrandom ${ratingDisplayMode === "peak" ? "Peak" : "Rating"}`,
  },
  { key: "openings", label: "Openings" },
  { key: "aliasCount", label: "Number of Aliases" },
];

const roundToTenth = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : null;
};

const normalizeRatingCell = (
  ratingValue: unknown,
  rdValue: unknown,
  hideForHighRd = true,
): RatingCell => {
  const rating = roundToTenth(ratingValue);
  const rd = Number(rdValue);
  const hidden =
    rating === null || (hideForHighRd && Number.isFinite(rd) && rd >= HIGH_RD_THRESHOLD);

  return {
    display: hidden ? "?" : rating,
    sortValue: hidden ? null : rating,
  };
};

const normalizeRatingCells = (row: PlayerRatingRow): RatingCells => {
  const rd = Number(row?.rd);
  return {
    current: normalizeRatingCell(row?.rating, rd, true),
    peak: normalizeRatingCell(row?.peak, rd, false),
  };
};

const sortIndicator = (
  sortKey: UserSortKey,
  sortDirection: "asc" | "desc",
  columnKey: UserSortKey,
): string => {
  if (sortKey !== columnKey) return "";
  return sortDirection === "asc" ? "↑" : "↓";
};

const compareNullableNumbers = (
  a: number | null | undefined,
  b: number | null | undefined,
  directionMultiplier: number,
): number => {
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;

  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (a === b) return 0;
  return directionMultiplier * (a - b);
};

const buildUserRows = (ratingRows: PlayerRatingRow[], aliasesLookup: AliasLookup): UserRow[] => {
  const rowsByUsername = new Map<string, UserRow>();

  (Array.isArray(ratingRows) ? ratingRows : []).forEach((row) => {
    const username = String(row?.username ?? "").trim();
    const mode = String(row?.tc ?? "").toLowerCase();
    if (!username || !isMode(mode)) return;

    const emptyRatingCells: RatingCells = {
      current: { display: "?", sortValue: null },
      peak: { display: "?", sortValue: null },
    };

    const existing: UserRow = rowsByUsername.get(username) ?? {
      username,
      blitz: emptyRatingCells,
      bullet: emptyRatingCells,
      hyperbullet: emptyRatingCells,
      wolfrandom: emptyRatingCells,
      aliasCount: aliasesLookup.get(username)?.aliases?.length ?? 0,
      aliases: aliasesLookup.get(username)?.aliases ?? [],
      openings: aliasesLookup.get(username)?.openings ?? [],
    };

    existing[mode] = normalizeRatingCells(row);
    existing.aliasCount = aliasesLookup.get(username)?.aliases?.length ?? existing.aliasCount ?? 0;
    existing.aliases = aliasesLookup.get(username)?.aliases ?? existing.aliases ?? [];
    existing.openings = aliasesLookup.get(username)?.openings ?? existing.openings ?? [];
    rowsByUsername.set(username, existing);
  });

  return [...rowsByUsername.values()];
};

const UsersTablePage = () => {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<UserSortKey>("blitz");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [ratingDisplayMode, setRatingDisplayMode] = useState<RatingDisplayMode>(
    getStoredRatingDisplayMode,
  );
  const [activeOpeningFilter, setActiveOpeningFilter] = useState("");

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

    void loadUsers();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(RATING_DISPLAY_STORAGE_KEY, ratingDisplayMode);
    } catch {
      // Ignore storage failures; the selected mode still applies for the current session.
    }
  }, [ratingDisplayMode]);

  const handleSort = (nextKey: UserSortKey): void => {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "username" ? "asc" : "desc");
  };

  const filteredRows = useMemo(() => {
    if (!activeOpeningFilter) return rows;

    return rows.filter((row) =>
      row.openings.map(normalizeOpeningKey).includes(activeOpeningFilter),
    );
  }, [activeOpeningFilter, rows]);

  const sortedRows = useMemo(() => {
    const directionMultiplier = sortDirection === "asc" ? 1 : -1;

    return [...filteredRows].sort((a, b) => {
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

      if (sortKey === "openings") {
        const openingCompare = compareNullableNumbers(
          a.openings.length,
          b.openings.length,
          directionMultiplier,
        );
        if (openingCompare !== 0) return openingCompare;
        return a.username.localeCompare(b.username);
      }

      const ratingCompare = compareNullableNumbers(
        a[sortKey][ratingDisplayMode].sortValue,
        b[sortKey][ratingDisplayMode].sortValue,
        directionMultiplier,
      );
      if (ratingCompare !== 0) return ratingCompare;

      return a.username.localeCompare(b.username);
    });
  }, [filteredRows, ratingDisplayMode, sortDirection, sortKey]);

  const userColumns = useMemo(() => getUserColumns(ratingDisplayMode), [ratingDisplayMode]);

  return (
    <div className="rankingsPage">
      <Seo
        title="Players"
        description="Browse the full atomic player list with blitz, bullet, hyperbullet, openings, and alias counts."
        path="/users"
      />
      <div className="panel rankingsPanel usersPanel">
        <h1>Player Directory</h1>

        {error ? <div className="errorText">{error}</div> : null}

        <div className="rankingsMeta usersMeta">
          <span>
            {loading
              ? "Loading players..."
              : activeOpeningFilter
                ? `${filteredRows.length} of ${rows.length} players`
                : `${rows.length} players`}
          </span>
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
          <div
            className="usersDisplayModeGroup"
            role="group"
            aria-label="Choose current or peak ratings"
          >
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
              <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
            </button>
            <span className="usersHelpTooltipBubble" role="tooltip">
              Message <strong>seaside_tiramisu</strong> on Lichess to be added to the rating system.
              Your account should be at least six months old, unless you are genuinely new to
              atomic. If you are using a newer account but have played before, send your old
              accounts along with the new one.
            </span>
          </span>
        </div>

        {!error && loading ? <div className="emptyRankings">Loading player list...</div> : null}

        {!error && !loading && rows.length === 0 ? (
          <div className="emptyRankings">No players available.</div>
        ) : null}

        {!error && !loading && rows.length > 0 && filteredRows.length === 0 ? (
          <div className="emptyRankings">
            No players found for {getOpeningDisplayLabel(activeOpeningFilter)}.
          </div>
        ) : null}

        {!error && !loading && rows.length > 0 && filteredRows.length > 0 ? (
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
                      {row.openings.length > 0 ? (
                        <div className="usersOpeningsCell">
                          <div className="usersOpeningTags" aria-label={`${row.username} openings`}>
                            {row.openings.map((opening) => {
                              const openingKey = normalizeOpeningKey(opening);

                              return (
                                <button
                                  type="button"
                                  key={`${row.username}-${openingKey}`}
                                  className={`usersOpeningTag${
                                    activeOpeningFilter === openingKey ? " active" : ""
                                  }`}
                                  aria-pressed={activeOpeningFilter === openingKey}
                                  onClick={() =>
                                    setActiveOpeningFilter((current) =>
                                      current === openingKey ? "" : openingKey,
                                    )
                                  }
                                >
                                  {getOpeningDisplayLabel(opening)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {row.aliasCount > 0 ? (
                        <div className="usersAliasCell">
                          <span
                            className="usersAliasToggle"
                            tabIndex={0}
                            aria-controls={`user-aliases-${row.username}`}
                          >
                            <span>{row.aliasCount}</span>
                            <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
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
