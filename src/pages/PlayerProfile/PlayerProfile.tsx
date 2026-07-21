import "./PlayerProfile.css";

import { faMagnifyingGlass, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { DualRangeSlider } from "../../components/DualRangeSlider/DualRangeSlider";
import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { MatchDetails } from "../../components/MatchDetails/MatchDetails";
import { MatchPageLink } from "../../components/MatchPageLink/MatchPageLink";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { ProfileMetricCard } from "../../components/ProfileMetricCard/ProfileMetricCard";
import { Seo } from "../../components/Seo/Seo";
import { SourceFilterChecks } from "../../components/SourceFilterChecks/SourceFilterChecks";
import { TimeControlFields } from "../../components/TimeControlFields/TimeControlFields";
import {
  createModeRecord,
  defaultMode,
  defaultRatingMax,
  defaultRatingMin,
  modeLabels,
  modeOptions,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
} from "../../constants/matches";
import type { RankHistoryMode } from "../../features/profile/favoriteOpponents";
import { FavoriteOpponentsSection } from "../../features/profile/FavoriteOpponentsSection";
import {
  buildMatchFilters,
  createDefaultProfileFilters,
  isClientSidePagedSearch,
  type ProfileFilters,
} from "../../features/profile/profileFilters";
import {
  getProfileHistoryTabFromLocation,
  getRankHistoryViewFromLocation,
  type ProfileHistoryTab,
  pushProfileHistoryLocation,
  type RankHistoryView,
} from "../../features/profile/profileNavigation";
import {
  ChessComProfileIcon,
  getAliasProfileHref,
  getAliasProfileSourceLabel,
  getOpeningToneClass,
  LichessProfileIcon,
  NON_COUNTED_ALIAS_MESSAGE,
  profileResultToneClass,
} from "../../features/profile/profilePresentation";
import {
  getChampionshipTrophies,
  getCurrentMonthKey,
  getRankingTrophies,
  isTrophyCaseSort,
  ProfileTrophyCaseCard,
  ProfileTrophyLink,
  sortProfileTrophies,
  type TrophyCaseSort,
  trophyCaseSortStorageKey,
} from "../../features/profile/profileTrophies";
import { useFavoriteOpponentsModel } from "../../features/profile/useFavoriteOpponentsModel";
import { useMatchSearch } from "../../hooks/useMatchSearch";
import { usePersistedState } from "../../hooks/usePersistedState";
import {
  buildRankingsLocation,
  filterMatches,
  getBestWinsForMode,
  getMonthRankHighlights,
  getMonthRanksForMode,
  getProfileMetricCardRows,
  getRatingDisplayByMode,
  useMonthRankPlayerCounts,
  useMonthRanks,
  useRatingsSnapshotByMode,
} from "../../hooks/usePlayerProfileData";
import { loadRawMatchesByMode, normalizeMatches } from "../../lib/matches/matchData";
import {
  type AliasAccount,
  type AliasIdentityRow,
  fetchProfileAliasRow,
} from "../../lib/supabase/supabaseAliases";
import { isRegisteredSiteUser } from "../../lib/supabase/supabaseUsers";
import {
  formatLocalDateTime,
  formatOpponentWithRating,
  formatScore,
  formatSignedDecimal,
} from "../../utils/formatters";
import { getTimeControlOptions } from "../../utils/matchCollection";
import { getOpeningDisplayLabel } from "../../utils/openings";
import { normalizeUsername } from "../../utils/playerNames";
import { readStoredSourceFilters, writeStoredSourceFilters } from "../../utils/sourceFilterStorage";
import { isToggleActionKey } from "../../utils/toggleActionKey";

const countOptions = [5, 10, 20];
const matchPrefetchDelayMs = 750;

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
};

const shouldSkipMatchPrefetch = (): boolean => {
  const connection = (navigator as NavigatorWithConnection).connection;
  return Boolean(
    connection?.saveData ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g",
  );
};

const getMatchSearchKey = (
  username: string,
  mode: import("../../constants/matches").Mode,
  filters: ProfileFilters,
  page: number,
  pageSize: number,
): string => JSON.stringify([username, mode, filters, page, pageSize]);

const CommunityDiscussion = lazy(async () => {
  const module = await import("../../components/PuzzleCommunity/PuzzleCommunity");
  return { default: module.CommunityDiscussion };
});

export const PlayerProfilePage = ({
  username,
  historyOnly = false,
}: {
  username?: string;
  historyOnly?: boolean;
}) => {
  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);
  const [matchHistoryMode, setMatchHistoryMode] =
    useState<import("../../constants/matches").Mode>(defaultMode);
  const [bestWinMode, setBestWinMode] =
    useState<import("../../constants/matches").Mode>(defaultMode);
  const [bestRankMode, setBestRankMode] =
    useState<import("../../constants/matches").Mode>(defaultMode);
  const [rankHistoryMode, setRankHistoryMode] = useState<RankHistoryMode>("all");
  const [rankHistoryView, setRankHistoryView] = useState<RankHistoryView>(
    getRankHistoryViewFromLocation,
  );
  const [trophyCaseSort, setTrophyCaseSort] = usePersistedState<TrophyCaseSort>(
    trophyCaseSortStorageKey,
    z.enum(["prestige", "date"]),
    "date",
  );
  const [profileHistoryTab, setProfileHistoryTab] = useState<ProfileHistoryTab>(() =>
    getProfileHistoryTabFromLocation(),
  );
  const [profileAliasEntry, setProfileAliasEntry] = useState<AliasIdentityRow | null>(null);
  const [aliasesLoaded, setAliasesLoaded] = useState(false);
  const [matchesByMode, setMatchesByMode] = useState(() => createModeRecord(() => []));
  const [totalMatchesByMode, setTotalMatchesByMode] = useState(() => createModeRecord(() => 0));
  const {
    error,
    loading: loadingMatches,
    reset: resetMatchSearch,
    run: runLatestMatchSearch,
  } = useMatchSearch();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedMatchKeys, setExpandedMatchKeys] = useState<string[]>([]);
  const [opponentRatingMin, setOpponentRatingMin] = useState(defaultRatingMin);
  const [opponentRatingMax, setOpponentRatingMax] = useState(defaultRatingMax);
  const [opponentFilter, setOpponentFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [sourceFilters, setSourceFilters] = useState(readStoredSourceFilters);
  const [timeControlInitialFilter, setTimeControlInitialFilter] = useState("all");
  const [timeControlIncrementFilter, setTimeControlIncrementFilter] = useState("all");
  const [isHistoryAvailable, setIsHistoryAvailable] = useState(false);
  const [lastCompletedMatchSearchKey, setLastCompletedMatchSearchKey] = useState("");
  const prefetchedMatchSearchKeysRef = useRef(new Set<string>());
  const canonicalUsername = profileAliasEntry?.username ?? normalizedUsername;
  const profileDisplayUsername = String(username || "").trim() || canonicalUsername;
  const isBanned = Boolean(profileAliasEntry?.banned);
  const profileDataUsername = aliasesLoaded ? canonicalUsername : "";
  const ratingsSnapshotByMode = useRatingsSnapshotByMode(profileDataUsername);
  const ratingDisplayByMode = useMemo(
    () => getRatingDisplayByMode(ratingsSnapshotByMode, canonicalUsername),
    [ratingsSnapshotByMode, canonicalUsername],
  );
  const profileModeOptions = useMemo(
    () =>
      modeOptions.filter(
        (mode) => mode !== "wolfrandom" || ratingDisplayByMode.wolfrandom.gamesPlayed > 0,
      ),
    [ratingDisplayByMode.wolfrandom.gamesPlayed],
  );
  const rankHistoryModeOptions: RankHistoryMode[] = ["all", ...profileModeOptions];
  const favoriteOpponentModeOptions: RankHistoryMode[] = ["all", ...profileModeOptions];
  const {
    rows: favoriteOpponentRows,
    mode: favoriteOpponentMode,
    matchLimit: favoriteOpponentMatchLimit,
    displayCount: favoriteOpponentDisplayCount,
    sort: favoriteOpponentSort,
    sortDirection: favoriteOpponentSortDirection,
    expandedKeys: expandedFavoriteOpponentKeys,
    loading: loadingFavoriteOpponents,
    error: favoriteOpponentsError,
    visibleRows: visibleFavoriteOpponentRows,
    currentPage: currentFavoriteOpponentPage,
    totalPages: favoriteOpponentTotalPages,
    scopeLabel: favoriteOpponentScopeLabel,
    setMode: setFavoriteOpponentMode,
    setMatchLimit: setFavoriteOpponentMatchLimit,
    setPage: setFavoriteOpponentPage,
    setDisplayCount: setFavoriteOpponentDisplayCount,
    applySort: applyFavoriteOpponentSort,
    toggleOpponent: toggleFavoriteOpponentKey,
  } = useFavoriteOpponentsModel({
    canonicalUsername,
    availableModes: profileModeOptions,
    enabled: aliasesLoaded && !isBanned && profileHistoryTab === "opponents",
    resetKey: normalizedUsername,
  });
  useEffect(() => {
    if (profileModeOptions.includes("wolfrandom")) return;
    if (rankHistoryMode === "wolfrandom") setRankHistoryMode("all");
    if (bestWinMode === "wolfrandom") setBestWinMode(defaultMode);
    if (bestRankMode === "wolfrandom") setBestRankMode(defaultMode);
    if (matchHistoryMode === "wolfrandom") setMatchHistoryMode(defaultMode);
  }, [bestRankMode, bestWinMode, matchHistoryMode, profileModeOptions, rankHistoryMode]);
  const monthRanks = useMonthRanks(
    profileDataUsername,
    !historyOnly || profileHistoryTab === "ranks",
  );
  const visibleMonthRanks = useMemo(
    () => monthRanks.filter((rank) => profileModeOptions.includes(rank.mode)),
    [monthRanks, profileModeOptions],
  );
  const monthRankPlayerCounts = useMonthRankPlayerCounts(
    monthRanks,
    profileHistoryTab === "ranks" && rankHistoryView === "history",
  );
  const [bestMonthRankCount, setBestMonthRankCount] = useState(5);
  const [recentMonthRankCount, setRecentMonthRankCount] = useState(5);
  const [bestWinCount, setBestWinCount] = useState(5);
  const [appliedFilters, setAppliedFilters] = useState(() => createDefaultProfileFilters());

  useEffect(() => {
    const defaultFilters = createDefaultProfileFilters();
    resetMatchSearch();
    setMatchHistoryMode(defaultMode);
    setBestWinMode(defaultMode);
    setBestRankMode(defaultMode);
    setRankHistoryMode("all");
    setProfileHistoryTab(getProfileHistoryTabFromLocation());
    setPage(1);
    setLastCompletedMatchSearchKey("");
    prefetchedMatchSearchKeysRef.current.clear();
    setExpandedMatchKeys([]);
    setMatchesByMode(createModeRecord(() => []));
    setTotalMatchesByMode(createModeRecord(() => 0));
    setOpponentRatingMin(defaultFilters.opponentRatingMin);
    setOpponentRatingMax(defaultFilters.opponentRatingMax);
    setOpponentFilter(defaultFilters.opponentFilter);
    setStartDateFilter(defaultFilters.startDateFilter);
    setEndDateFilter(defaultFilters.endDateFilter);
    setSourceFilters(defaultFilters.sourceFilters);
    setTimeControlInitialFilter(defaultFilters.timeControlInitialFilter);
    setTimeControlIncrementFilter(defaultFilters.timeControlIncrementFilter);
    setAppliedFilters(defaultFilters);
  }, [normalizedUsername, resetMatchSearch]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [normalizedUsername]);

  useEffect(() => {
    const handlePopState = () => {
      setProfileHistoryTab(getProfileHistoryTabFromLocation());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let isCurrent = true;

    const loadProfileAliasEntry = async () => {
      if (isCurrent) {
        setAliasesLoaded(false);
        setProfileAliasEntry(null);
      }

      try {
        const nextProfileAliasEntry = await fetchProfileAliasRow(normalizedUsername);
        if (isCurrent) {
          setProfileAliasEntry(nextProfileAliasEntry);
          setAliasesLoaded(true);
        }
      } catch {
        if (isCurrent) {
          setProfileAliasEntry(null);
          setAliasesLoaded(true);
        }
      }
    };

    void loadProfileAliasEntry();

    return () => {
      isCurrent = false;
    };
  }, [normalizedUsername]);

  useEffect(() => {
    let isCurrent = true;

    const loadHistoryAvailability = async () => {
      if (historyOnly || !aliasesLoaded || !canonicalUsername) {
        setIsHistoryAvailable(false);
        return;
      }

      try {
        const isRegistered = await isRegisteredSiteUser(canonicalUsername);
        if (!isCurrent) return;
        setIsHistoryAvailable(isRegistered);
      } catch {
        if (!isCurrent) return;
        setIsHistoryAvailable(false);
      }
    };

    void loadHistoryAvailability();

    return () => {
      isCurrent = false;
    };
  }, [aliasesLoaded, canonicalUsername, historyOnly]);

  const runMatchSearch = useCallback(
    async (
      mode: import("../../constants/matches").Mode,
      nextAppliedFilters: ProfileFilters,
      nextPage: number = 1,
    ): Promise<void> => {
      const result = await runLatestMatchSearch(
        async () => {
          const filters = buildMatchFilters(canonicalUsername, nextAppliedFilters);
          const shouldClientPageResults = isClientSidePagedSearch(nextAppliedFilters);
          const rawMatches: import("../../lib/matches/matchData").ParsedMatch[] = [];
          let totalForServerPaging = 0;
          if (shouldClientPageResults) {
            const result = await loadRawMatchesByMode(mode, { filters });
            rawMatches.push(...result);
            totalForServerPaging = result.length;
          } else {
            const result = await loadRawMatchesByMode(mode, { filters, page: nextPage, pageSize });
            rawMatches.push(...result.matches);
            totalForServerPaging = result.total;
          }
          const normalizedMatchesForMode = normalizeMatches(rawMatches, canonicalUsername);
          return {
            matches: normalizedMatchesForMode,
            total: shouldClientPageResults ? normalizedMatchesForMode.length : totalForServerPaging,
          };
        },
        () => {
          setMatchesByMode((current) => ({ ...current, [mode]: [] }));
          setTotalMatchesByMode((current) => ({ ...current, [mode]: 0 }));
        },
      );
      if (!result) return;
      setMatchesByMode((current) => ({ ...current, [mode]: result.matches }));
      setTotalMatchesByMode((current) => ({ ...current, [mode]: result.total }));
      setAppliedFilters(nextAppliedFilters);
      setPage(nextPage);
      setLastCompletedMatchSearchKey(
        getMatchSearchKey(canonicalUsername, mode, nextAppliedFilters, nextPage, pageSize),
      );
    },
    [canonicalUsername, pageSize, runLatestMatchSearch],
  );

  useEffect(() => {
    setExpandedMatchKeys([]);
  }, [page, matchHistoryMode, appliedFilters, canonicalUsername]);

  const matches = useMemo(
    () => matchesByMode[matchHistoryMode] ?? [],
    [matchHistoryMode, matchesByMode],
  );

  const { initialOptions, incrementOptions } = useMemo(
    () => getTimeControlOptions(matches),
    [matches],
  );
  const filteredMatches = useMemo(
    () => filterMatches(matches, appliedFilters),
    [matches, appliedFilters],
  );
  const isClientPagedResults = isClientSidePagedSearch(appliedFilters);
  const totalPages = Math.max(
    1,
    Math.ceil(
      (isClientPagedResults
        ? filteredMatches.length
        : (totalMatchesByMode[matchHistoryMode] ?? 0)) / Math.max(1, pageSize),
    ),
  );
  const currentPage = Math.min(page, totalPages);
  const visibleMatches = useMemo(() => {
    if (!isClientPagedResults) return filteredMatches;
    const pageStart = (currentPage - 1) * pageSize;
    return filteredMatches.slice(pageStart, pageStart + pageSize);
  }, [currentPage, filteredMatches, isClientPagedResults, pageSize]);
  const requestedServerPage = isClientPagedResults ? 1 : currentPage;

  useEffect(() => {
    if (!aliasesLoaded || isBanned || profileHistoryTab !== "matches") return;
    void runMatchSearch(matchHistoryMode, appliedFilters, requestedServerPage);
  }, [
    aliasesLoaded,
    appliedFilters,
    isBanned,
    matchHistoryMode,
    profileHistoryTab,
    requestedServerPage,
    runMatchSearch,
  ]);

  useEffect(() => {
    if (
      loadingMatches ||
      !aliasesLoaded ||
      isBanned ||
      profileHistoryTab !== "matches" ||
      isClientPagedResults ||
      profileModeOptions.length < 2 ||
      shouldSkipMatchPrefetch()
    ) {
      return;
    }

    const activeSearchKey = getMatchSearchKey(
      canonicalUsername,
      matchHistoryMode,
      appliedFilters,
      requestedServerPage,
      pageSize,
    );
    if (lastCompletedMatchSearchKey !== activeSearchKey) return;

    const currentModeIndex = profileModeOptions.indexOf(matchHistoryMode);
    const nextMode = profileModeOptions[(currentModeIndex + 1) % profileModeOptions.length];
    if (!nextMode || nextMode === matchHistoryMode) return;

    const prefetchKey = getMatchSearchKey(
      canonicalUsername,
      nextMode,
      appliedFilters,
      requestedServerPage,
      pageSize,
    );
    if (prefetchedMatchSearchKeysRef.current.has(prefetchKey)) return;

    let cancelled = false;
    const prefetch = (): void => {
      if (cancelled) return;
      prefetchedMatchSearchKeysRef.current.add(prefetchKey);
      const filters = buildMatchFilters(canonicalUsername, appliedFilters);
      void loadRawMatchesByMode(nextMode, {
        filters,
        page: requestedServerPage,
        pageSize,
      }).catch(() => {
        prefetchedMatchSearchKeysRef.current.delete(prefetchKey);
      });
    };

    let idleCallbackId: number | undefined;
    const delayId = window.setTimeout(() => {
      if ("requestIdleCallback" in window) {
        idleCallbackId = window.requestIdleCallback(prefetch, { timeout: 2_000 });
      } else {
        prefetch();
      }
    }, matchPrefetchDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(delayId);
      if (idleCallbackId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackId);
      }
    };
  }, [
    aliasesLoaded,
    appliedFilters,
    canonicalUsername,
    isBanned,
    isClientPagedResults,
    lastCompletedMatchSearchKey,
    loadingMatches,
    matchHistoryMode,
    pageSize,
    profileHistoryTab,
    profileModeOptions,
    requestedServerPage,
  ]);

  const handleSearchClick = () => {
    if (loadingMatches) return;
    setPage(1);
    setAppliedFilters({
      opponentRatingMin,
      opponentRatingMax,
      opponentFilter,
      startDateFilter,
      endDateFilter,
      sourceFilters: { ...sourceFilters },
      timeControlInitialFilter,
      timeControlIncrementFilter,
    });
  };
  const setSourceFilter = (
    source: keyof import("../../constants/matches").SourceFilters,
    checked: boolean,
  ): void => {
    setSourceFilters((current) => {
      const next = { ...current, [source]: checked };
      writeStoredSourceFilters(next);
      return next;
    });
  };
  const handleModeChange = (nextMode: import("../../constants/matches").Mode): void => {
    const nextModeFilters = createDefaultProfileFilters();

    setMatchHistoryMode(nextMode);
    setPage(1);
    setTimeControlInitialFilter(nextModeFilters.timeControlInitialFilter);
    setTimeControlIncrementFilter(nextModeFilters.timeControlIncrementFilter);
    setAppliedFilters((current) => ({
      ...current,
      timeControlInitialFilter: nextModeFilters.timeControlInitialFilter,
      timeControlIncrementFilter: nextModeFilters.timeControlIncrementFilter,
    }));
  };
  const handleProfileHistoryTabChange = (nextTab: ProfileHistoryTab): void => {
    if (profileHistoryTab === nextTab) return;
    setProfileHistoryTab(nextTab);
    pushProfileHistoryLocation(nextTab);
  };

  const handleRankHistoryViewChange = (nextView: RankHistoryView): void => {
    if (rankHistoryView === nextView) return;
    setRankHistoryView(nextView);
    pushProfileHistoryLocation("ranks", nextView);
  };

  useEffect(() => {
    if (isBanned) return;

    if (currentPage !== page) {
      setPage(currentPage);
    }
  }, [currentPage, isBanned, page]);

  const bestWins = useMemo(
    () => getBestWinsForMode(ratingDisplayByMode, bestWinMode, bestWinCount),
    [bestWinCount, bestWinMode, ratingDisplayByMode],
  );
  const bestRankMonthRanks = useMemo(
    () => getMonthRanksForMode(visibleMonthRanks, bestRankMode),
    [bestRankMode, visibleMonthRanks],
  );
  const bestMonthRanks = useMemo(
    () =>
      getMonthRankHighlights(bestRankMonthRanks, bestMonthRankCount, recentMonthRankCount)
        .bestMonthRanks,
    [bestRankMonthRanks, bestMonthRankCount, recentMonthRankCount],
  );
  const recentMonthRanks = useMemo(
    () =>
      getMonthRankHighlights(visibleMonthRanks, bestMonthRankCount, recentMonthRankCount)
        .recentMonthRanks,
    [bestMonthRankCount, recentMonthRankCount, visibleMonthRanks],
  );
  const rankHistoryRows = useMemo(
    () =>
      getMonthRanksForMode(visibleMonthRanks, rankHistoryMode)
        .map((monthRank) => ({
          ...monthRank,
          playerCount: monthRankPlayerCounts[`${monthRank.monthValue}|${monthRank.mode}`] ?? null,
        }))
        .sort((a, b) => {
          const dateDifference = b.monthDate.getTime() - a.monthDate.getTime();
          if (dateDifference !== 0) return dateDifference;
          return modeOptions.indexOf(a.mode) - modeOptions.indexOf(b.mode);
        }),
    [monthRankPlayerCounts, rankHistoryMode, visibleMonthRanks],
  );
  const profileOpenings = useMemo(() => {
    if (!aliasesLoaded) return [];

    return [
      ...new Set(
        (profileAliasEntry?.openings ?? [])
          .map((opening) => String(opening || "").trim())
          .filter(Boolean),
      ),
    ];
  }, [aliasesLoaded, profileAliasEntry]);
  const aliasDisplayRows = useMemo(() => {
    const canonicalAlias = normalizeUsername(canonicalUsername);
    const isCanonicalAlias = (account: Pick<AliasAccount, "alias" | "displayAlias">): boolean =>
      normalizeUsername(account.alias) === canonicalAlias ||
      normalizeUsername(account.displayAlias) === canonicalAlias;
    const isDrunkAlias = (account: Pick<AliasAccount, "source" | "isCounted">): boolean =>
      account.source === "lichess" && !account.isCounted;
    const compareAliasRows = (left: AliasAccount, right: AliasAccount): number => {
      const leftIsCanonical = isCanonicalAlias(left);
      const rightIsCanonical = isCanonicalAlias(right);
      if (leftIsCanonical !== rightIsCanonical) return leftIsCanonical ? -1 : 1;

      const leftIsDrunk = isDrunkAlias(left);
      const rightIsDrunk = isDrunkAlias(right);
      if (leftIsDrunk !== rightIsDrunk) return leftIsDrunk ? 1 : -1;

      if (left.source !== right.source) return left.source === "lichess" ? -1 : 1;
      return left.displayAlias.localeCompare(right.displayAlias);
    };

    return (profileAliasEntry?.accounts ?? [])
      .map((account): AliasAccount => ({ ...account }))
      .sort(compareAliasRows);
  }, [canonicalUsername, profileAliasEntry]);
  const latestMonthKeyByMode = useMemo(
    () =>
      visibleMonthRanks.reduce<
        Partial<
          Record<
            import("../../constants/matches").Mode,
            import("../../hooks/usePlayerProfileData").MonthRank
          >
        >
      >((acc, monthRank) => {
        const existing = acc[monthRank.mode];
        if (!existing || monthRank.monthDate > existing.monthDate) {
          acc[monthRank.mode] = monthRank;
        }
        return acc;
      }, {}),
    [visibleMonthRanks],
  );
  const profileMetricRows = useMemo(
    () =>
      getProfileMetricCardRows(
        ratingDisplayByMode,
        Object.fromEntries(
          Object.entries(latestMonthKeyByMode).map(([mode, monthRank]) => [
            mode,
            monthRank?.monthKey ?? "",
          ]),
        ),
      ).filter((row) => row.key !== "wolfrandom-row" || profileModeOptions.includes("wolfrandom")),
    [latestMonthKeyByMode, profileModeOptions, ratingDisplayByMode],
  );
  const rankingTrophies = useMemo(() => getRankingTrophies(monthRanks), [monthRanks]);
  const championshipTrophies = useMemo(
    () => getChampionshipTrophies(canonicalUsername),
    [canonicalUsername],
  );
  const profileTrophies = useMemo(
    () => sortProfileTrophies([...championshipTrophies, ...rankingTrophies], "prestige"),
    [championshipTrophies, rankingTrophies],
  );
  const trophyCaseTrophies = useMemo(
    () => sortProfileTrophies(profileTrophies, trophyCaseSort),
    [profileTrophies, trophyCaseSort],
  );
  const currentMonthKey = getCurrentMonthKey();
  const visibleProfileTrophies = useMemo(
    () =>
      sortProfileTrophies(
        [
          ...championshipTrophies,
          ...rankingTrophies.filter((trophy) => trophy.dateLabel === currentMonthKey),
        ],
        "prestige",
      ).slice(0, 3),
    [championshipTrophies, currentMonthKey, rankingTrophies],
  );
  const hasVisibleProfileTrophies = visibleProfileTrophies.length > 0;

  const toggleMatchKey = (key: string): void => {
    setExpandedMatchKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  };
  return (
    <div className="rankingsPage">
      <Seo
        title={historyOnly ? `${canonicalUsername} games` : `${canonicalUsername} : Activity`}
        description={
          historyOnly
            ? `View ${canonicalUsername}'s atomic chess match history, rank history, and favorite opponents.`
            : `View ${canonicalUsername}'s atomic chess profile, ratings, monthly ranks, best wins, aliases, and recent matches.`
        }
        path={
          historyOnly
            ? `/@/${encodeURIComponent(canonicalUsername)}/history`
            : `/@/${encodeURIComponent(canonicalUsername)}`
        }
      />
      <div
        className={`panel rankingsPanel playerProfilePanel${historyOnly ? " playerHistoryPanel" : ""}`}
      >
        {historyOnly ? (
          <div className="profileIdentityRow noTrophies">
            <div className="profileIdentityTitle">
              <h1>
                <Link
                  className="profileHistoryTitleLink"
                  to="/@/$username"
                  params={{ username: canonicalUsername }}
                >
                  {profileDisplayUsername}
                </Link>
                <span> Match History</span>
              </h1>
            </div>
          </div>
        ) : (
          <div
            className={`profileIdentityRow${!isBanned && hasVisibleProfileTrophies ? "" : " noTrophies"}${
              !isBanned && visibleProfileTrophies.length >= 3 ? " compactOpenings" : ""
            }`}
          >
            <div className="profileIdentityTitle">
              <h1>{profileDisplayUsername}</h1>
              {profileOpenings.length ? (
                <div className="profileOpeningTags" aria-label="Recognized atomic openings">
                  {profileOpenings.map((opening) => (
                    <span
                      key={`opening-${opening}`}
                      className={`profileOpeningTag ${getOpeningToneClass(opening)}`}
                    >
                      {getOpeningDisplayLabel(opening)}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {!isBanned && visibleProfileTrophies.length ? (
              <div className="profileTrophyRow" aria-label="Atomic trophies">
                {visibleProfileTrophies.map((trophy) => (
                  <ProfileTrophyLink key={trophy.key} trophy={trophy} />
                ))}
              </div>
            ) : null}
          </div>
        )}

        {isBanned ? (
          <section className="profileBanNotice" aria-labelledby="profile-ban-notice-title">
            <span className="profileBanIcon" aria-hidden="true">
              <FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" />
            </span>
            <div className="profileBanNoticeContent">
              <span className="profileBanEyebrow">Fair play status</span>
              <div className="profileBanNoticeHeader">
                <h2 id="profile-ban-notice-title">
                  This player is not included in Atomic Puzzles ratings.
                </h2>
              </div>
              <p>
                This player was banned by Lichess or deemed highly suspicious, so we do not include
                them in the rating system.
              </p>
              <div className="profileBanActions" aria-label="Fair play links">
                <Link to="/users/banned">Banned user list</Link>
              </div>
            </div>
          </section>
        ) : !historyOnly ? (
          <div className="profileTopBar">
            {profileMetricRows.map((row) => (
              <section
                key={row.key}
                className="profileMetricRow"
                aria-label={`${row.label} ratings`}
              >
                <h2 className="profileMetricRowTitle">{row.label}</h2>
                <div className="profileMetricRowCards">
                  {row.cards.map((card) => (
                    <ProfileMetricCard
                      key={card.key}
                      label={card.label}
                      value={card.value}
                      valueSuffix={card.valueSuffix}
                      valueLink={card.valueLink}
                      subtext={card.subtext}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {!isBanned && !historyOnly ? (
          <div className="profileActionRow">
            <Link
              className="profilePuzzleDashboardLink"
              to="/@/$username/history"
              params={{ username: canonicalUsername }}
              search={{ tab: "comments" }}
            >
              View comments
            </Link>
            {isHistoryAvailable ? (
              <Link
                className="profilePuzzleDashboardLink"
                to="/@/$username/puzzles"
                params={{ username: canonicalUsername }}
              >
                View puzzle dashboard
              </Link>
            ) : null}
            <Link
              className="profilePuzzleDashboardLink"
              to="/@/$username/history"
              params={{ username: canonicalUsername }}
            >
              View history
            </Link>
          </div>
        ) : null}

        {!historyOnly ? (
          <div className="profileHighlights profileHighlightsTopRow">
            {!isBanned ? (
              <div className="profileBestWins">
                <div className="profileBestMonthRanksHeader">
                  <h2>Best Wins</h2>
                  <div className="profileHeaderControls">
                    <label htmlFor="profile-best-win-mode-select">
                      Mode
                      <select
                        id="profile-best-win-mode-select"
                        value={bestWinMode}
                        onChange={(event) => {
                          const v = event.target.value;
                          if ((profileModeOptions as readonly string[]).includes(v)) {
                            setBestWinMode(v as import("../../constants/matches").Mode);
                          }
                        }}
                      >
                        {profileModeOptions.map((mode) => (
                          <option key={mode} value={mode}>
                            {modeLabels[mode] ?? mode}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor="profile-best-win-count-select">
                      Show
                      <select
                        id="profile-best-win-count-select"
                        value={bestWinCount}
                        onChange={(event) => setBestWinCount(Number(event.target.value))}
                      >
                        {countOptions.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                {bestWins.length === 0 ? (
                  <div className="emptyRankings">
                    No wins available in {modeLabels[bestWinMode]}.
                  </div>
                ) : (
                  <ol>
                    {bestWins.map((win) => (
                      <li key={`best-${win.gameId}`}>
                        <span className="profileBestWinOpponent">
                          <Link
                            className="rankingLink"
                            to="/@/$username"
                            params={{ username: win.opponent }}
                          >
                            {formatOpponentWithRating(win.opponent, win.opponentRating)}
                          </Link>
                        </span>
                        <span className="profileBestWinDate">
                          <LichessGameLink gameId={win.gameId}>
                            {formatLocalDateTime(win.startTs)}
                          </LichessGameLink>
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ) : null}

            <div className="profileAliases">
              <h2>Aliases</h2>
              {!aliasesLoaded ? (
                <div className="emptyRankings">Loading aliases...</div>
              ) : aliasDisplayRows.length === 0 ? (
                <div className="emptyRankings">No aliases listed.</div>
              ) : (
                <div className="profileAliasesList">
                  {aliasDisplayRows.map(({ alias, displayAlias, source, isCounted }) => {
                    const sourceLabel = getAliasProfileSourceLabel(source);
                    const externalAlias = displayAlias || alias;
                    return (
                      <div key={`alias-${source}-${alias}`} className="profileAliasRow">
                        <span className="profileAliasName">
                          <span>{externalAlias}</span>
                          {source === "lichess" && !isCounted ? (
                            <span
                              className="profileAliasStatus"
                              aria-label={NON_COUNTED_ALIAS_MESSAGE}
                              tabIndex={0}
                            >
                              <span aria-hidden="true">🍺</span>
                              <span className="profileAliasTooltip" role="tooltip">
                                {NON_COUNTED_ALIAS_MESSAGE} For more info,
                                <Link
                                  className="profileAliasTooltipLink"
                                  to="/rankings/how-ratings-work"
                                  hash="drunk-accounts"
                                >
                                  click here
                                </Link>
                                .
                              </span>
                            </span>
                          ) : null}
                        </span>
                        <a
                          className={`profileAliasAccountLink ${
                            source === "chesscom"
                              ? "profileAliasChessComLink"
                              : "profileAliasLichessLink"
                          }`}
                          href={getAliasProfileHref(source, externalAlias)}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Open ${externalAlias} on ${sourceLabel}`}
                          title={`Open ${externalAlias} on ${sourceLabel}`}
                        >
                          {source === "chesscom" ? <ChessComProfileIcon /> : <LichessProfileIcon />}
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        {!historyOnly && !isBanned ? (
          <div className="profileHighlights profileHighlightsBottomRow">
            <div className="profileBestMonthRanks">
              <div className="profileBestMonthRanksHeader">
                <h2>Best Ranks</h2>
                <div className="profileHeaderControls">
                  <label htmlFor="profile-best-rank-mode-select">
                    Mode
                    <select
                      id="profile-best-rank-mode-select"
                      value={bestRankMode}
                      onChange={(event) => {
                        const v = event.target.value;
                        if ((profileModeOptions as readonly string[]).includes(v)) {
                          setBestRankMode(v as import("../../constants/matches").Mode);
                        }
                      }}
                    >
                      {profileModeOptions.map((mode) => (
                        <option key={mode} value={mode}>
                          {modeLabels[mode] ?? mode}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label htmlFor="profile-best-month-rank-count-select">
                    Show
                    <select
                      id="profile-best-month-rank-count-select"
                      value={bestMonthRankCount}
                      onChange={(event) => setBestMonthRankCount(Number(event.target.value))}
                    >
                      {countOptions.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {bestMonthRanks.length === 0 ? (
                <div className="emptyRankings">
                  No monthly ranks available in {modeLabels[bestRankMode]}.
                </div>
              ) : (
                <ol>
                  {bestMonthRanks.map((monthRank) => (
                    <li key={`best-month-rank-${monthRank.mode}-${monthRank.monthKey}`}>
                      <a
                        className="rankingLink profileBestMonthRankPrimary"
                        href={buildRankingsLocation(monthRank.monthKey, monthRank.mode)}
                      >
                        {monthRank.monthLabel} {modeLabels[monthRank.mode] ?? monthRank.mode} · #
                        {monthRank.rank}
                      </a>
                      <span className="profileBestMonthRankRating">{monthRank.rating ?? "—"}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="profileBestMonthRanks">
              <div className="profileBestMonthRanksHeader">
                <h2>Recent Ranks</h2>
                <label htmlFor="profile-recent-month-rank-count-select">
                  Show
                  <select
                    id="profile-recent-month-rank-count-select"
                    value={recentMonthRankCount}
                    onChange={(event) => setRecentMonthRankCount(Number(event.target.value))}
                  >
                    {countOptions.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {recentMonthRanks.length === 0 ? (
                <div className="emptyRankings">No monthly ranks available.</div>
              ) : (
                <ol>
                  {recentMonthRanks.map((monthRank) => (
                    <li key={`recent-month-rank-${monthRank.mode}-${monthRank.monthKey}`}>
                      <a
                        className="rankingLink profileBestMonthRankPrimary"
                        href={buildRankingsLocation(monthRank.monthKey, monthRank.mode)}
                      >
                        {monthRank.monthLabel} {modeLabels[monthRank.mode] ?? monthRank.mode} · #
                        {monthRank.rank}
                      </a>
                      <span className="profileBestMonthRankRating">{monthRank.rating ?? "—"}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ) : null}

        {!isBanned ? (
          <>
            <div className="profileHistoryArea">
              <div className="profileHistoryTabs" role="tablist" aria-label="Profile history">
                <button
                  id="profile-match-history-tab"
                  type="button"
                  role="tab"
                  aria-selected={profileHistoryTab === "matches"}
                  aria-controls="profile-match-history-panel"
                  className={profileHistoryTab === "matches" ? "active" : ""}
                  onClick={() => handleProfileHistoryTabChange("matches")}
                >
                  Match History
                </button>
                <button
                  id="profile-rank-history-tab"
                  type="button"
                  role="tab"
                  aria-selected={profileHistoryTab === "ranks"}
                  aria-controls="profile-rank-history-panel"
                  className={profileHistoryTab === "ranks" ? "active" : ""}
                  onClick={() => handleProfileHistoryTabChange("ranks")}
                >
                  Rank History
                </button>
                <button
                  id="profile-favorite-opponents-tab"
                  type="button"
                  role="tab"
                  aria-selected={profileHistoryTab === "opponents"}
                  aria-controls="profile-favorite-opponents-panel"
                  className={profileHistoryTab === "opponents" ? "active" : ""}
                  onClick={() => handleProfileHistoryTabChange("opponents")}
                >
                  Favorite Opponents
                </button>
                <button
                  id="profile-comments-tab"
                  type="button"
                  role="tab"
                  aria-selected={profileHistoryTab === "comments"}
                  aria-controls="profile-comments-panel"
                  className={profileHistoryTab === "comments" ? "active" : ""}
                  onClick={() => handleProfileHistoryTabChange("comments")}
                >
                  Comments
                </button>
              </div>

              <section
                id="profile-match-history-panel"
                className="profileHistorySection"
                role="tabpanel"
                aria-labelledby="profile-match-history-tab"
                hidden={profileHistoryTab !== "matches"}
              >
                {profileHistoryTab === "matches" ? (
                  <>
                    <form
                      className="matchFilterPanel profileMatchFilters"
                      onSubmit={(event) => {
                        event.preventDefault();
                        handleSearchClick();
                      }}
                    >
                      <div className="matchFilterGrid">
                        <label htmlFor="profile-page-size-select">
                          Page size
                          <select
                            id="profile-page-size-select"
                            value={pageSize}
                            onChange={(event) => {
                              setPageSize(Number(event.target.value));
                              setPage(1);
                            }}
                          >
                            {pageSizeOptions.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>
                        <TimeControlFields
                          initialId="profile-time-initial-select"
                          incrementId="profile-time-increment-select"
                          initialValue={timeControlInitialFilter}
                          incrementValue={timeControlIncrementFilter}
                          initialOptions={initialOptions}
                          incrementOptions={incrementOptions}
                          onInitialChange={setTimeControlInitialFilter}
                          onIncrementChange={setTimeControlIncrementFilter}
                          startDateId="profile-start-date-filter"
                          endDateId="profile-end-date-filter"
                          startDateValue={startDateFilter}
                          endDateValue={endDateFilter}
                          onStartDateChange={setStartDateFilter}
                          onEndDateChange={setEndDateFilter}
                        />
                        <label
                          htmlFor="profile-opponent-filter"
                          className="profileOpponentFilterField"
                        >
                          Opponent
                          <input
                            id="profile-opponent-filter"
                            type="text"
                            value={opponentFilter}
                            onChange={(event) => setOpponentFilter(event.target.value)}
                            placeholder="username"
                          />
                        </label>
                      </div>

                      <div className="matchFilterRanges">
                        <DualRangeSlider
                          id="opponent-rating-min"
                          label={`Opponent rating range: ${opponentRatingMin} - ${opponentRatingMax}`}
                          min={opponentRatingSliderMin}
                          max={opponentRatingSliderMax}
                          step={10}
                          lowerValue={opponentRatingMin}
                          upperValue={opponentRatingMax}
                          onLowerChange={setOpponentRatingMin}
                          onUpperChange={setOpponentRatingMax}
                        />
                      </div>

                      <div className="matchFilterFooter profileMatchFilterFooter">
                        <SourceFilterChecks values={sourceFilters} onChange={setSourceFilter} />
                        <div className="matchFilterActions">
                          <button
                            className="primaryActionButton matchFilterSearch"
                            type="submit"
                            disabled={loadingMatches}
                          >
                            <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
                            {loadingMatches ? "Searching..." : "Search"}
                          </button>
                        </div>
                      </div>
                    </form>

                    {error ? <div className="errorText">{error}</div> : null}

                    <div className="rankingsMeta profileHistoryMeta">
                      <div className="profileHistoryTitleControl">
                        <label htmlFor="profile-match-history-mode-select">
                          <span>Mode</span>
                          <select
                            id="profile-match-history-mode-select"
                            aria-label="Match history mode"
                            value={matchHistoryMode}
                            onChange={(event) => {
                              const v = event.target.value;
                              if ((profileModeOptions as readonly string[]).includes(v)) {
                                handleModeChange(v as import("../../constants/matches").Mode);
                              }
                            }}
                          >
                            {profileModeOptions.map((mode) => (
                              <option key={mode} value={mode}>
                                {modeLabels[mode] ?? mode}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="rankingsTableWrap profileMatchTableWrap">
                      <table className="rankingsTable profileMatchTable">
                        <colgroup>
                          <col className="profileMatchDateColumn" />
                          <col className="profileMatchOpponentColumn" />
                          <col className="profileMatchTimeControlColumn" />
                          <col className="profileMatchScoreColumn" />
                          <col className="profileMatchRatingColumn" />
                          <col className="profileMatchRdColumn" />
                          <col className="profileMatchLinkColumn" />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Date / Time</th>
                            <th>Opponent</th>
                            <th>TC</th>
                            <th>Score</th>
                            <th>Rating (Δ)</th>
                            <th>RD (Δ)</th>
                            <th aria-label="Open match page" />
                          </tr>
                        </thead>
                        <tbody>
                          {visibleMatches.map((match) => {
                            const matchKey = `${match.startTs}-${match.firstGameId}`;
                            const isExpanded = expandedMatchKeys.includes(matchKey);
                            return (
                              <Fragment key={matchKey}>
                                <tr
                                  className={`expandableMatchRow${isExpanded ? " expanded" : ""}`}
                                  onClick={() => toggleMatchKey(matchKey)}
                                  onKeyDown={(event) => {
                                    if (!isToggleActionKey(event)) return;
                                    event.preventDefault();
                                    toggleMatchKey(matchKey);
                                  }}
                                  role="button"
                                  tabIndex={0}
                                  aria-expanded={isExpanded}
                                >
                                  <td>
                                    <LichessGameLink
                                      gameId={match.firstGameId}
                                      source={match.sourceValue}
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      {formatLocalDateTime(match.startTs)}
                                    </LichessGameLink>
                                  </td>
                                  <td>
                                    <Link
                                      className="rankingLink"
                                      to="/@/$username"
                                      params={{ username: match.opponent }}
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      {formatOpponentWithRating(
                                        match.opponent,
                                        match.opponentAfterRating,
                                      )}
                                    </Link>
                                  </td>
                                  <td>
                                    <span className="profileTablePill">{match.timeControl}</span>
                                  </td>
                                  <td className="scoreCell">
                                    <span className="profileScoreBox">
                                      <span
                                        className={`profileScoreValue${profileResultToneClass(
                                          match.playerScore,
                                          match.opponentScore,
                                        )}`}
                                      >
                                        {formatScore(match.playerScore)}
                                      </span>
                                      <span className="scoreDash">-</span>
                                      <span className="profileScoreValue">
                                        {formatScore(match.opponentScore)}
                                      </span>
                                    </span>
                                  </td>
                                  <td>
                                    <span className="profileMetricPair">
                                      <span className="profileMetricValue">
                                        {match.beforeRating}
                                      </span>
                                      <span className="profileDelta">
                                        {formatSignedDecimal(match.ratingChange)}
                                      </span>
                                    </span>
                                  </td>
                                  <td>
                                    <span className="profileMetricPair">
                                      <span className="profileMetricValue">{match.beforeRd}</span>
                                      <span className="profileDelta">
                                        {formatSignedDecimal(match.rdChange)}
                                      </span>
                                    </span>
                                  </td>
                                  <td>
                                    <MatchPageLink
                                      match={{
                                        ...match,
                                        playerA: canonicalUsername,
                                        playerB: match.opponent,
                                        mode: matchHistoryMode,
                                      }}
                                      onClick={(event) => event.stopPropagation()}
                                      title="Open match page in new tab"
                                    />
                                  </td>
                                </tr>
                                {isExpanded ? (
                                  <tr className="matchDetailsRow">
                                    <td colSpan={7}>
                                      <div className="matchDetailsInner">
                                        <MatchDetails
                                          match={{
                                            matchId: match.matchId,
                                            mode: matchHistoryMode,
                                            playerA: canonicalUsername,
                                            playerB: match.opponent,
                                            startTs: match.startTs,
                                            timeControl: match.timeControl,
                                            sourceValue: match.sourceValue,
                                            firstGameId: match.firstGameId,
                                            scoreA: match.playerScore,
                                            scoreB: match.opponentScore,
                                            playerABeforeRating: match.beforeRating,
                                            playerAAfterRating: match.afterRating,
                                            playerABeforeRd: match.beforeRd,
                                            playerAAfterRd: match.afterRd,
                                            playerBBeforeRating: match.opponentBeforeRating,
                                            playerBAfterRating: match.opponentAfterRating,
                                            playerBBeforeRd: match.opponentBeforeRd,
                                            playerBAfterRd: match.opponentAfterRd,
                                            games: match.games.map((game, index) => ({
                                              id: game.id,
                                              index,
                                              resultLabel: game.winner,
                                              scoreAAfter: game.playerScoreAfter,
                                              scoreBAfter: game.opponentScoreAfter,
                                            })),
                                          }}
                                          matchKey={matchKey}
                                          showH2HLink
                                          showRunningScore
                                          stopPropagation={(event) => event.stopPropagation()}
                                        />
                                      </div>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })}
                          {visibleMatches.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="emptyRankings">
                                {`No matches found for this player with current filters in ${modeLabels[matchHistoryMode]}.`}
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>

                    <PaginationRow
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={setPage}
                      formatLabel={(current, total) => `Page ${current} / ${total}`}
                      disabled={loadingMatches}
                    />
                  </>
                ) : null}
              </section>

              <section
                id="profile-rank-history-panel"
                className="profileHistorySection"
                role="tabpanel"
                aria-labelledby="profile-rank-history-tab"
                hidden={profileHistoryTab !== "ranks"}
              >
                {profileHistoryTab === "ranks" ? (
                  <>
                    <div className="rankingsMeta profileHistoryMeta">
                      <div className="profileHistoryTitleControl">
                        <label htmlFor="profile-rank-history-view-select">
                          <span>View</span>
                          <select
                            id="profile-rank-history-view-select"
                            aria-label="Rank history view"
                            value={rankHistoryView}
                            onChange={(event) => {
                              const nextView = event.target.value;
                              if (nextView === "history" || nextView === "trophies") {
                                handleRankHistoryViewChange(nextView);
                              }
                            }}
                          >
                            <option value="history">History</option>
                            <option value="trophies">Trophy Case</option>
                          </select>
                        </label>
                        {rankHistoryView === "history" ? (
                          <label htmlFor="profile-rank-history-mode-select">
                            <span>Mode</span>
                            <select
                              id="profile-rank-history-mode-select"
                              aria-label="Rank history mode"
                              value={rankHistoryMode}
                              onChange={(event) => {
                                const v = event.target.value;
                                if (
                                  v === "all" ||
                                  (profileModeOptions as readonly string[]).includes(v)
                                ) {
                                  setRankHistoryMode(v as RankHistoryMode);
                                }
                              }}
                            >
                              {rankHistoryModeOptions.map((mode) => (
                                <option key={mode} value={mode}>
                                  {mode === "all" ? "All" : (modeLabels[mode] ?? mode)}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <label htmlFor="profile-trophy-case-sort-select">
                            <span>Sort</span>
                            <select
                              id="profile-trophy-case-sort-select"
                              aria-label="Trophy case sort"
                              value={trophyCaseSort}
                              onChange={(event) => {
                                const nextSort = event.target.value;
                                if (isTrophyCaseSort(nextSort)) {
                                  setTrophyCaseSort(nextSort);
                                }
                              }}
                            >
                              <option value="prestige">Prestige</option>
                              <option value="date">Date</option>
                            </select>
                          </label>
                        )}
                      </div>
                      <span>
                        {rankHistoryView === "history"
                          ? `${rankHistoryRows.length} months`
                          : `${trophyCaseTrophies.length} trophies`}
                      </span>
                    </div>

                    {rankHistoryView === "history" ? (
                      <div className="rankingsTableWrap profileRankHistoryTableWrap">
                        <table className="rankingsTable profileRankHistoryTable">
                          <thead>
                            <tr>
                              <th>Month</th>
                              <th>Mode</th>
                              <th>Rank</th>
                              <th>Players</th>
                              <th>Rating</th>
                              <th>RD</th>
                              <th>Games</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rankHistoryRows.map((monthRank) => (
                              <tr key={`rank-history-${monthRank.mode}-${monthRank.monthKey}`}>
                                <td>
                                  <a
                                    className="rankingLink"
                                    href={buildRankingsLocation(monthRank.monthKey, monthRank.mode)}
                                  >
                                    {monthRank.monthLabel}
                                  </a>
                                </td>
                                <td>{modeLabels[monthRank.mode] ?? monthRank.mode}</td>
                                <td>#{monthRank.rank}</td>
                                <td>{monthRank.playerCount ?? "..."}</td>
                                <td>{monthRank.rating ?? "—"}</td>
                                <td>{monthRank.rd ?? "—"}</td>
                                <td>{monthRank.games ?? "—"}</td>
                              </tr>
                            ))}
                            {rankHistoryRows.length === 0 ? (
                              <tr>
                                <td colSpan={7} className="emptyRankings">
                                  No rank history available.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    ) : trophyCaseTrophies.length ? (
                      <div className="profileTrophyCaseGrid" aria-label="Trophy case">
                        {trophyCaseTrophies.map((trophy) => (
                          <ProfileTrophyCaseCard key={`case-${trophy.key}`} trophy={trophy} />
                        ))}
                      </div>
                    ) : (
                      <div className="emptyRankings">
                        No top 10, AWC, or Chess.com championship trophies yet.
                      </div>
                    )}
                  </>
                ) : null}
              </section>

              {profileHistoryTab === "opponents" ? (
                <FavoriteOpponentsSection
                  hidden={false}
                  canonicalUsername={canonicalUsername}
                  modeOptions={favoriteOpponentModeOptions}
                  mode={favoriteOpponentMode}
                  matchLimit={favoriteOpponentMatchLimit}
                  displayCount={favoriteOpponentDisplayCount}
                  sort={favoriteOpponentSort}
                  sortDirection={favoriteOpponentSortDirection}
                  rows={favoriteOpponentRows}
                  visibleRows={visibleFavoriteOpponentRows}
                  expandedOpponentKeys={expandedFavoriteOpponentKeys}
                  loading={loadingFavoriteOpponents}
                  error={favoriteOpponentsError}
                  scopeLabel={favoriteOpponentScopeLabel}
                  currentPage={currentFavoriteOpponentPage}
                  totalPages={favoriteOpponentTotalPages}
                  onModeChange={(nextMode) => {
                    setFavoriteOpponentMode(nextMode);
                    setFavoriteOpponentPage(1);
                  }}
                  onMatchLimitChange={(nextLimit) => {
                    setFavoriteOpponentMatchLimit(nextLimit);
                    setFavoriteOpponentPage(1);
                  }}
                  onDisplayCountChange={(nextCount) => {
                    setFavoriteOpponentDisplayCount(nextCount);
                    setFavoriteOpponentPage(1);
                  }}
                  onSortChange={applyFavoriteOpponentSort}
                  onPageChange={setFavoriteOpponentPage}
                  onToggleOpponent={toggleFavoriteOpponentKey}
                />
              ) : (
                <section
                  id="profile-favorite-opponents-panel"
                  className="profileHistorySection"
                  role="tabpanel"
                  aria-labelledby="profile-favorite-opponents-tab"
                  hidden
                />
              )}

              <section
                id="profile-comments-panel"
                className="profileHistorySection"
                role="tabpanel"
                aria-labelledby="profile-comments-tab"
                hidden={profileHistoryTab !== "comments"}
              >
                {profileHistoryTab === "comments" && aliasesLoaded && canonicalUsername ? (
                  <Suspense fallback={<div className="emptyRankings">Loading comments...</div>}>
                    <CommunityDiscussion
                      target={{ type: "profile", id: canonicalUsername }}
                      eyebrow="Profile community"
                      heading={`Comments on ${profileDisplayUsername}`}
                    />
                  </Suspense>
                ) : null}
              </section>
            </div>
          </>
        ) : null}

        {isBanned && aliasesLoaded && canonicalUsername ? (
          <div className="profileHistoryArea">
            <div className="profileHistoryTabs" role="tablist" aria-label="Profile history">
              <button
                id="profile-comments-tab"
                type="button"
                role="tab"
                aria-selected="true"
                aria-controls="profile-comments-panel"
                className="active"
              >
                Comments
              </button>
            </div>
            <section
              id="profile-comments-panel"
              className="profileHistorySection"
              role="tabpanel"
              aria-labelledby="profile-comments-tab"
            >
              <Suspense fallback={<div className="emptyRankings">Loading comments...</div>}>
                <CommunityDiscussion
                  target={{ type: "profile", id: canonicalUsername }}
                  eyebrow="Profile community"
                  heading={`Comments on ${profileDisplayUsername}`}
                />
              </Suspense>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
};
