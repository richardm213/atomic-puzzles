import { Link } from "@tanstack/react-router";
import { Fragment, type KeyboardEvent } from "react";

import { MatchPageLink } from "../../components/MatchPageLink/MatchPageLink";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { modeLabels } from "../../constants/matches";
import { formatLocalDateTime, formatScore, formatSignedDecimal } from "../../utils/formatters";
import { matchupToSlug } from "../../utils/h2hRoutes";
import {
  buildMatchRouteParams,
  buildSingleGameMatchUrl,
  shouldUseInternalMatchPage,
} from "../../utils/matchRoutes";
import { normalizeUsername } from "../../utils/playerNames";
import { isToggleActionKey } from "../../utils/toggleActionKey";
import {
  favoriteOpponentDisplayCountOptions,
  type FavoriteOpponentRow,
  type FavoriteOpponentSort,
  type FavoriteOpponentSortDirection,
  favoriteOpponentSortLabels,
  favoriteOpponentSortOptions,
  getFavoriteOpponentAllowedMatchLimit,
  getFavoriteOpponentMatchLimitOptions,
  isFavoriteOpponentMode,
  isFavoriteOpponentSort,
  type RankHistoryMode,
} from "./favoriteOpponents";

type FavoriteOpponentsSectionProps = {
  hidden: boolean;
  canonicalUsername: string;
  modeOptions: RankHistoryMode[];
  mode: RankHistoryMode;
  matchLimit: number;
  displayCount: number;
  sort: FavoriteOpponentSort;
  sortDirection: FavoriteOpponentSortDirection;
  rows: FavoriteOpponentRow[];
  visibleRows: FavoriteOpponentRow[];
  expandedOpponentKeys: string[];
  loading: boolean;
  error: string;
  scopeLabel: string;
  currentPage: number;
  totalPages: number;
  onModeChange: (mode: RankHistoryMode) => void;
  onMatchLimitChange: (limit: number) => void;
  onDisplayCountChange: (count: number) => void;
  onSortChange: (sort: FavoriteOpponentSort, direction?: FavoriteOpponentSortDirection) => void;
  onPageChange: (page: number) => void;
  onToggleOpponent: (opponentKey: string) => void;
};

export const FavoriteOpponentsSection = ({
  hidden,
  canonicalUsername,
  modeOptions,
  mode,
  matchLimit,
  displayCount,
  sort,
  sortDirection,
  rows,
  visibleRows,
  expandedOpponentKeys,
  loading,
  error,
  scopeLabel,
  currentPage,
  totalPages,
  onModeChange,
  onMatchLimitChange,
  onDisplayCountChange,
  onSortChange,
  onPageChange,
  onToggleOpponent,
}: FavoriteOpponentsSectionProps) => {
  const headerSort = (column: FavoriteOpponentSort): "ascending" | "descending" | "none" =>
    sort === column ? (sortDirection === "asc" ? "ascending" : "descending") : "none";
  const sortGlyph = (column: FavoriteOpponentSort): string =>
    sort === column ? (sortDirection === "asc" ? "↑" : "↓") : "";
  const handleHeaderSort = (column: FavoriteOpponentSort): void =>
    onSortChange(column, sort === column ? (sortDirection === "desc" ? "asc" : "desc") : undefined);
  const handleToggleKey = (event: KeyboardEvent<HTMLTableRowElement>, key: string): void => {
    if (!isToggleActionKey(event)) return;
    event.preventDefault();
    onToggleOpponent(key);
  };

  return (
    <section
      id="profile-favorite-opponents-panel"
      className="profileHistorySection"
      role="tabpanel"
      aria-labelledby="profile-favorite-opponents-tab"
      hidden={hidden}
    >
      <div className="rankingsMeta profileHistoryMeta profileFavoriteOpponentsMeta">
        <div className="profileFavoriteOpponentsControls">
          <label htmlFor="profile-favorite-opponents-mode-select">
            <span>Mode</span>
            <select
              id="profile-favorite-opponents-mode-select"
              aria-label="Favorite opponents mode"
              value={mode}
              disabled={loading}
              onChange={(event) => {
                const value = event.target.value;
                if (!isFavoriteOpponentMode(value)) return;
                const nextLimit = getFavoriteOpponentAllowedMatchLimit(value, matchLimit);
                onModeChange(value);
                if (nextLimit !== matchLimit) {
                  onMatchLimitChange(nextLimit);
                }
              }}
            >
              {modeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All" : (modeLabels[option] ?? option)}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="profile-favorite-opponents-match-limit-select">
            <span>Last</span>
            <select
              id="profile-favorite-opponents-match-limit-select"
              aria-label="Favorite opponents last matches sample"
              value={matchLimit}
              disabled={loading}
              onChange={(event) => {
                const nextLimit = Number(event.target.value);
                onMatchLimitChange(nextLimit);
              }}
            >
              {getFavoriteOpponentMatchLimitOptions(mode).map((count) => (
                <option key={count} value={count}>
                  {count.toLocaleString("en-US")} matches
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="profile-favorite-opponents-count-select">
            <span>Show</span>
            <select
              id="profile-favorite-opponents-count-select"
              aria-label="Favorite opponents shown"
              value={displayCount}
              onChange={(event) => onDisplayCountChange(Number(event.target.value))}
            >
              {favoriteOpponentDisplayCountOptions.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="profile-favorite-opponents-sort-select">
            <span>Sort</span>
            <select
              id="profile-favorite-opponents-sort-select"
              aria-label="Favorite opponents sort"
              value={sort}
              onChange={(event) => {
                if (isFavoriteOpponentSort(event.target.value)) onSortChange(event.target.value);
              }}
            >
              {favoriteOpponentSortOptions.map((option) => (
                <option key={option} value={option}>
                  {favoriteOpponentSortLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <button
            className="profileFavoriteOpponentsDirectionButton"
            type="button"
            aria-label={`Sort ${sortDirection === "asc" ? "ascending" : "descending"}`}
            onClick={() => onSortChange(sort, sortDirection === "asc" ? "desc" : "asc")}
          >
            <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>
            {sortDirection === "asc" ? "Asc" : "Desc"}
          </button>
        </div>
      </div>

      {error ? <div className="errorText">{error}</div> : null}

      <div className="rankingsTableWrap profileFavoriteOpponentsTableWrap">
        <table className="rankingsTable profileFavoriteOpponentsTable">
          <thead>
            <tr>
              {(
                [
                  ["opponent", "Opponent"],
                  ["score", "H2H Score"],
                  ["performance", "Perf"],
                  ["ratingGain", "Rating Δ"],
                  ["recent", "Most Recent"],
                  ["timeControl", "Most Played TC"],
                ] as const
              ).map(([column, label]) => (
                <th key={column} aria-sort={headerSort(column)}>
                  <button
                    className="profileFavoriteOpponentsSortButton"
                    type="button"
                    onClick={() => handleHeaderSort(column)}
                  >
                    {label}
                    <span aria-hidden="true">{sortGlyph(column)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const opponentKey = normalizeUsername(row.opponent);
              const isExpanded = expandedOpponentKeys.includes(opponentKey);
              return (
                <Fragment key={`favorite-opponent-${opponentKey}`}>
                  <tr
                    className={`expandableMatchRow profileFavoriteOpponentRow${isExpanded ? " expanded" : ""}`}
                    onClick={() => onToggleOpponent(opponentKey)}
                    onKeyDown={(event) => handleToggleKey(event, opponentKey)}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isExpanded}
                  >
                    <td>
                      <Link
                        className="rankingLink"
                        to="/@/$username"
                        params={{ username: row.opponent }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {row.opponent}
                      </Link>
                    </td>
                    <td>{`${formatScore(row.playerScore)} - ${formatScore(row.opponentScore)}`}</td>
                    <td>{row.performanceScore ?? "—"}</td>
                    <td>
                      {row.ratedMatchCount > 0 ? (
                        <span className="profileDelta">
                          {formatSignedDecimal(row.ratingChange)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatLocalDateTime(row.mostRecentTs)}</td>
                    <td>
                      {row.favoriteTimeControl}
                      {row.favoriteTimeControlCount > 0 ? ` (${row.favoriteTimeControlCount})` : ""}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="favoriteOpponentMatchesRow">
                      <td colSpan={6}>
                        <div className="favoriteOpponentMatchesInner">
                          <div className="favoriteOpponentMatchesHeader">
                            <span>{`${row.matches.length.toLocaleString("en-US")} matches vs ${row.opponent}`}</span>
                            <Link
                              className="profileFavoriteOpponentH2HButton"
                              to="/h2h/$matchup"
                              params={{ matchup: matchupToSlug(canonicalUsername, row.opponent) }}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                            >
                              H2H
                            </Link>
                          </div>
                          <table className="favoriteOpponentMatchesTable">
                            <thead>
                              <tr>
                                <th>Date / Time</th>
                                <th>Match ID</th>
                                <th>TC</th>
                                <th>Score</th>
                                <th>Rating Δ</th>
                                <th aria-label="Open match page" />
                              </tr>
                            </thead>
                            <tbody>
                              {row.matches.map((match) => {
                                const matchLinkMatch = {
                                  ...match,
                                  playerA: canonicalUsername,
                                  playerB: row.opponent,
                                  mode: match.mode,
                                };
                                const singleGameUrl = buildSingleGameMatchUrl(matchLinkMatch);
                                const shouldLinkToMatchPage =
                                  shouldUseInternalMatchPage(matchLinkMatch);
                                return (
                                  <tr
                                    key={`${opponentKey}-${match.startTs}-${match.firstGameId}-${match.matchId}`}
                                  >
                                    <td>{formatLocalDateTime(match.startTs)}</td>
                                    <td>
                                      {shouldLinkToMatchPage ? (
                                        <Link
                                          className="rankingLink"
                                          to="/matches/$mode/$matchId"
                                          params={buildMatchRouteParams(matchLinkMatch)}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          {match.matchId || match.firstGameId}
                                        </Link>
                                      ) : singleGameUrl ? (
                                        <a
                                          className="rankingLink"
                                          href={singleGameUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={(event) => event.stopPropagation()}
                                        >
                                          {match.firstGameId}
                                        </a>
                                      ) : (
                                        match.firstGameId
                                      )}
                                    </td>
                                    <td>
                                      <span className="profileTablePill">{match.timeControl}</span>
                                    </td>
                                    <td>{`${formatScore(match.playerScore)} - ${formatScore(match.opponentScore)}`}</td>
                                    <td>
                                      {Number.isFinite(match.ratingChange) ? (
                                        <span className="profileDelta">
                                          {formatSignedDecimal(match.ratingChange)}
                                        </span>
                                      ) : (
                                        "—"
                                      )}
                                    </td>
                                    <td>
                                      <MatchPageLink
                                        match={matchLinkMatch}
                                        onClick={(event) => event.stopPropagation()}
                                        title="Open match page in new tab"
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
            {loading ? (
              <tr>
                <td colSpan={6} className="emptyRankings">
                  {`Loading favorite opponents from the last ${matchLimit.toLocaleString("en-US")} ${scopeLabel}...`}
                </td>
              </tr>
            ) : null}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="emptyRankings">
                  {`No favorite opponents found in the last ${matchLimit.toLocaleString("en-US")} ${scopeLabel}.`}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {rows.length > displayCount ? (
        <PaginationRow
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
          formatLabel={(current, total) => `Page ${current} / ${total}`}
          disabled={loading}
        />
      ) : null}
    </section>
  );
};
