import "./Users.css";

import { faChevronDown, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";

import { DataTable } from "../../components/DataTable/DataTable";
import { SortableTableHeader } from "../../components/DataTable/SortableTableHeader";
import { InlineState } from "../../components/InlineState/InlineState";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { atomic960Enabled, isMode, type Mode } from "../../constants/matches";
import { usePersistedState } from "../../hooks/usePersistedState";
import { useTableSort } from "../../hooks/useTableSort";
import type { PlayerDirectoryRow, PlayerRatingRow } from "../../lib/archive/ratings";
import type { AliasLookup } from "../../lib/users/aliasesLookup";
import { aliasesLookupQueryOptions } from "../../lib/users/aliasQueries";
import { userRatingsQueryOptions } from "../../lib/users/userQueries";
import { getErrorMessage } from "../../utils/errors";
import { getOpeningDisplayLabel, normalizeOpeningKey } from "../../utils/openings";

const HIGH_RD_THRESHOLD = 100;
const RATING_DISPLAY_STORAGE_KEY = "atomic-users-rating-display-mode";
const ratingDisplayOptions = ["current", "peak"] as const;
type RatingDisplayMode = (typeof ratingDisplayOptions)[number];
const ratingDisplayModeSchema = z.enum(ratingDisplayOptions);

type RatingCell = { display: string | number; sortValue: number | null };
type RatingCells = { current: RatingCell; peak: RatingCell };
type UserRatingMode = Exclude<Mode, "wolfrandom">;

type UserRow = {
  username: string;
  banned: boolean;
  bot: boolean;
  blitz: RatingCells;
  bullet: RatingCells;
  hyperbullet: RatingCells;
  atomic960: RatingCells;
  aliasCount: number;
  aliases: string[];
  openings: string[];
};

type UserSortKey = "username" | "openings" | "aliasCount" | UserRatingMode;

const isUserRatingMode = (mode: Mode): mode is UserRatingMode => mode !== "wolfrandom";

const getUserColumns = (
  ratingDisplayMode: RatingDisplayMode,
): Array<{ key: UserSortKey; label: string }> => {
  const ratingLabel = ratingDisplayMode === "peak" ? "Peak" : "Rating";
  return [
    { key: "username", label: "Username" },
    { key: "blitz", label: `Blitz ${ratingLabel}` },
    { key: "bullet", label: `Bullet ${ratingLabel}` },
    { key: "hyperbullet", label: `Hyper ${ratingLabel}` },
    ...(atomic960Enabled ? [{ key: "atomic960" as const, label: `Atomic960 ${ratingLabel}` }] : []),
    { key: "openings", label: "Openings" },
    { key: "aliasCount", label: "Number of Aliases" },
  ];
};

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

export const buildUserRows = (
  ratingRows: PlayerRatingRow[],
  aliasesLookup: AliasLookup,
): UserRow[] => {
  const rowsByUsername = new Map<string, UserRow>();

  (Array.isArray(ratingRows) ? ratingRows : []).forEach((row) => {
    const username = String(row?.username ?? "").trim();
    const mode = String(row?.tc ?? "").toLowerCase();
    if (!username || !isMode(mode)) return;
    const aliasEntry = aliasesLookup.get(username);
    const isEstimated = Boolean(aliasEntry?.banned || aliasEntry?.bot);

    const emptyRatingCells: RatingCells = {
      current: { display: "?", sortValue: null },
      peak: { display: "?", sortValue: null },
    };

    const existing: UserRow = rowsByUsername.get(username) ?? {
      username,
      banned: Boolean(aliasEntry?.banned),
      bot: Boolean(aliasEntry?.bot),
      blitz: emptyRatingCells,
      bullet: emptyRatingCells,
      hyperbullet: emptyRatingCells,
      atomic960: emptyRatingCells,
      aliasCount: aliasesLookup.get(username)?.aliases?.length ?? 0,
      aliases: aliasesLookup.get(username)?.aliases ?? [],
      openings: aliasesLookup.get(username)?.openings ?? [],
    };

    existing.banned = Boolean(aliasEntry?.banned);
    existing.bot = Boolean(aliasEntry?.bot);
    if (isUserRatingMode(mode)) {
      existing[mode] = isEstimated ? emptyRatingCells : normalizeRatingCells(row);
    }
    existing.aliasCount = aliasesLookup.get(username)?.aliases?.length ?? existing.aliasCount ?? 0;
    existing.aliases = aliasesLookup.get(username)?.aliases ?? existing.aliases ?? [];
    existing.openings = aliasesLookup.get(username)?.openings ?? existing.openings ?? [];
    rowsByUsername.set(username, existing);
  });

  return [...rowsByUsername.values()];
};

export const expandPlayerDirectoryRows = (rows: PlayerDirectoryRow[]): PlayerRatingRow[] =>
  rows.flatMap((row) =>
    (["blitz", "bullet", "hyperbullet", "atomic960"] as const).map((mode) => ({
      username: row.username,
      tc: mode,
      rating: row[`${mode}_rating`],
      peak: row[`${mode}_peak`],
      rd: row[`${mode}_rd`],
      peak_date: null,
      games: null,
      rank: null,
      top20_wins: null,
    })),
  );

const UsersTablePage = () => {
  const { changeSort, sortDirection, sortKey } = useTableSort<UserSortKey>({
    initialKey: "blitz",
    getDefaultDirection: (key) => (key === "username" ? "asc" : "desc"),
  });
  const [ratingDisplayMode, setRatingDisplayMode] = usePersistedState<RatingDisplayMode>(
    RATING_DISPLAY_STORAGE_KEY,
    ratingDisplayModeSchema,
    "current",
  );
  const [activeOpeningFilter, setActiveOpeningFilter] = useState("");
  const ratingsQuery = useQuery(userRatingsQueryOptions());
  const aliasesQuery = useQuery(aliasesLookupQueryOptions());
  const rows = useMemo(
    () =>
      buildUserRows(
        expandPlayerDirectoryRows(ratingsQuery.data ?? []),
        aliasesQuery.data ?? new Map(),
      ),
    [aliasesQuery.data, ratingsQuery.data],
  );
  const loading = ratingsQuery.isPending || aliasesQuery.isPending;
  const queryError = ratingsQuery.error ?? aliasesQuery.error;
  const error = queryError ? getErrorMessage(queryError, "Failed to load users.") : "";

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

  if (loading && rows.length === 0) return <RouteLoadingFallback />;

  return (
    <div className="rankingsPage">
      <Seo
        title="Players"
        description="Browse atomic player ratings, peaks, openings, and linked account aliases."
        path="/users"
      />
      <div className="panel rankingsPanel usersPanel">
        <h1>Player Directory</h1>

        {error ? <InlineState kind="error">{error}</InlineState> : null}

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

        {!error && !loading && rows.length === 0 ? (
          <InlineState kind="empty">No players available.</InlineState>
        ) : null}

        {!error && !loading && rows.length > 0 && filteredRows.length === 0 ? (
          <InlineState kind="empty">
            No players found for {getOpeningDisplayLabel(activeOpeningFilter)}.
          </InlineState>
        ) : null}

        {!error && !loading && rows.length > 0 && filteredRows.length > 0 ? (
          <DataTable wrapperClassName="rankingsTableWrap" className="rankingsTable usersTable">
            <thead>
              <tr>
                {userColumns.map((column) => (
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
                    <PlayerLink className="rankingLink" username={row.username}>
                      {row.username}
                    </PlayerLink>
                    {row.banned ? (
                      <span className="usersClassificationTag usersClassificationTagCheater">
                        CHEATER
                      </span>
                    ) : null}
                    {row.bot ? <span className="usersClassificationTag">BOT</span> : null}
                  </td>
                  <td>{row.blitz[ratingDisplayMode].display}</td>
                  <td>{row.bullet[ratingDisplayMode].display}</td>
                  <td>{row.hyperbullet[ratingDisplayMode].display}</td>
                  {atomic960Enabled ? <td>{row.atomic960[ratingDisplayMode].display}</td> : null}
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
          </DataTable>
        ) : null}
      </div>
    </div>
  );
};

export const UsersPage = () => <UsersTablePage />;
