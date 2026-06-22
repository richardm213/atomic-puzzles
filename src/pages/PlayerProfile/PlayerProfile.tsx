import "./PlayerProfile.css";

import { faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  defaultSourceFilters,
  modeLabels,
  modeOptions,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
} from "../../constants/matches";
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
import { fetchProfileAliasRow } from "../../lib/supabase/supabaseAliases";
import { monthKeyFromMonthValue } from "../../lib/supabase/supabaseLb";
import { isRegisteredSiteUser } from "../../lib/supabase/supabaseUsers";
import { appAssetPath } from "../../utils/appAssetPath";
import {
  formatLocalDateTime,
  formatOpponentWithRating,
  formatScore,
  formatSignedDecimal,
} from "../../utils/formatters";
import { matchupToSlug } from "../../utils/h2hRoutes";
import { getTimeControlOptions } from "../../utils/matchCollection";
import { parseDateInputBoundary } from "../../utils/matchFilters";
import { getOpeningDisplayLabel } from "../../utils/openings";
import { normalizeUsername } from "../../utils/playerNames";
import { isToggleActionKey } from "../../utils/toggleActionKey";

const countOptions = [5, 10, 20];
type RankHistoryMode = import("../../constants/matches").Mode | "all";
const profileHistoryTabOptions = ["matches", "ranks", "opponents"] as const;
type ProfileHistoryTab = (typeof profileHistoryTabOptions)[number];
const rankHistoryModeOptions: RankHistoryMode[] = ["all", ...modeOptions];
const favoriteOpponentModeOptions: RankHistoryMode[] = ["all", ...modeOptions];
const favoriteOpponentDefaultMatchLimit = 500;
const favoriteOpponentMatchLimitOptions = [500, 1000, 2000];
const favoriteOpponentPageSize = 200;
const favoriteOpponentDisplayCountOptions = [25, 50, 100];

type ProfileFilters = {
  opponentRatingMin: number;
  opponentRatingMax: number;
  opponentFilter: string;
  startDateFilter: string;
  endDateFilter: string;
  sourceFilters: import("../../constants/matches").SourceFilters;
  timeControlInitialFilter: string;
  timeControlIncrementFilter: string;
};

type FavoriteOpponentMatch = import("../../lib/matches/matchData").NormalizedMatch & {
  mode: import("../../constants/matches").Mode;
};

type FavoriteOpponentRow = {
  opponent: string;
  matchCount: number;
  playerScore: number;
  opponentScore: number;
  mostRecentTs: number;
  favoriteTimeControl: string;
  favoriteTimeControlCount: number;
};

const lichessProfileUrl = (username: string): string =>
  `https://lichess.org/@/${encodeURIComponent(String(username || "").trim())}`;

const isExternalHref = (href: string): boolean => /^https?:\/\//i.test(String(href || "").trim());

const NON_COUNTED_ALIAS_MESSAGE =
  "This account is marked as a drunk account and is not included in the rating system.";

const isProfileHistoryTab = (value: string): value is ProfileHistoryTab =>
  (profileHistoryTabOptions as readonly string[]).includes(value);

const getProfileHistoryTabFromSearch = (search: string): ProfileHistoryTab => {
  const requestedTab = new URLSearchParams(search).get("tab") ?? "";
  return isProfileHistoryTab(requestedTab) ? requestedTab : "matches";
};

const getProfileHistoryTabFromLocation = (): ProfileHistoryTab => {
  if (typeof window === "undefined") return "matches";
  return getProfileHistoryTabFromSearch(window.location.search);
};

const openingToneClasses: Record<string, string> = {
  "nf3 e3": "openingToneNf3E3",
  "nf3 e4": "openingToneNf3E4",
  e4: "openingToneE4",
  e5: "openingToneE5",
  d4: "openingToneD4",
  d6: "openingToneD6",
  "2n": "openingTone2n",
  "2n h3": "openingTone2nH3",
  nh3: "openingToneNh3",
  "nh3 d4": "openingToneNh3D4",
  "nh3 e4": "openingToneNh3E4",
  "nh3 e3": "openingToneNh3E3",
  "nh3 na3": "openingToneNh3Na3",
  nc3: "openingToneNc3",
  na3: "openingToneNa3",
  "nf3 d4": "openingToneNf3D4",
  "nf3 nd4": "openingToneNf3Nd4",
  "nf3 c3": "openingToneNf3C3",
  "e3 nc3": "openingToneE3Nc3",
  "e3 qh5": "openingToneE3Qh5",
  "e3 qf3": "openingToneE3Qf3",
  "e3 f4": "openingToneE3F4",
  "nh3 nc3": "openingToneNh3Nc3",
  variety: "openingToneVariety",
};

const getOpeningToneClass = (opening: string): string =>
  openingToneClasses[
    String(opening || "")
      .trim()
      .toLowerCase()
  ] ?? "openingToneDefault";

const profileTrophyAssets = {
  champion: appAssetPath("/images/lichess-trophies/gold-cup-2.png"),
  top10: appAssetPath("/images/lichess-trophies/silver-cup-2.png"),
  top30: appAssetPath("/images/lichess-trophies/gold-cup-2-blue.png"),
};

const awcTrophyAssets = {
  awc2021: appAssetPath("/images/awc-trophies/atomicwc21.png"),
  awc2022: appAssetPath("/images/awc-trophies/atomicwc22.png"),
  awc2023: appAssetPath("/images/awc-trophies/atomicwc23.png"),
  awc2024: appAssetPath("/images/awc-trophies/atomicwc24.png"),
};

const awcChampionTrophiesByUsername = {
  "fast-tsunami": [
    {
      key: "awc-2021",
      label: "AWC 2021",
      title: "Atomic World Champion 2021",
      imageSrc: awcTrophyAssets.awc2021,
      href: appAssetPath("/tournaments/awc2021"),
    },
  ],
  natso: [
    {
      key: "awc-2024",
      label: "AWC 2024",
      title: "Atomic World Champion 2024",
      imageSrc: awcTrophyAssets.awc2024,
      href: appAssetPath("/tournaments/awc2024"),
    },
  ],
  sutcunuri: [
    {
      key: "awc-2022",
      label: "AWC 2022",
      title: "Atomic World Champion 2022",
      imageSrc: awcTrophyAssets.awc2022,
      href: appAssetPath("/tournaments/awc2022"),
    },
  ],
  vlad_00: [
    {
      key: "awc-2023",
      label: "AWC 2023",
      title: "Atomic World Champion 2023",
      imageSrc: awcTrophyAssets.awc2023,
      href: appAssetPath("/tournaments/awc2023"),
    },
  ],
};

const getCurrentMonthKey = () => monthKeyFromMonthValue(new Date().toISOString().slice(0, 10));

const profileResultToneClass = (playerScore: number, opponentScore: number): string => {
  if (playerScore > opponentScore) return " winner";
  if (playerScore < opponentScore) return " loser";
  return "";
};

const favoriteTimeControlFromCounts = (
  counts: Map<string, { count: number; latestTs: number }>,
): { favoriteTimeControl: string; favoriteTimeControlCount: number } => {
  const favorite = [...counts.entries()].sort((left, right) => {
    const countDifference = right[1].count - left[1].count;
    if (countDifference !== 0) return countDifference;
    return right[1].latestTs - left[1].latestTs;
  })[0];

  return {
    favoriteTimeControl: favorite?.[0] ?? "—",
    favoriteTimeControlCount: favorite?.[1].count ?? 0,
  };
};

const getFavoriteOpponentRows = (matches: FavoriteOpponentMatch[]): FavoriteOpponentRow[] => {
  const rowsByOpponent = new Map<
    string,
    {
      opponent: string;
      matchCount: number;
      playerScore: number;
      opponentScore: number;
      mostRecentTs: number;
      timeControlCounts: Map<string, { count: number; latestTs: number }>;
    }
  >();

  matches.forEach((match) => {
    const opponentKey = normalizeUsername(match.opponent);
    if (!opponentKey) return;

    const existing =
      rowsByOpponent.get(opponentKey) ??
      ({
        opponent: match.opponent,
        matchCount: 0,
        playerScore: 0,
        opponentScore: 0,
        mostRecentTs: Number.NEGATIVE_INFINITY,
        timeControlCounts: new Map<string, { count: number; latestTs: number }>(),
      } satisfies {
        opponent: string;
        matchCount: number;
        playerScore: number;
        opponentScore: number;
        mostRecentTs: number;
        timeControlCounts: Map<string, { count: number; latestTs: number }>;
      });

    existing.matchCount += 1;
    existing.playerScore += match.playerScore;
    existing.opponentScore += match.opponentScore;
    existing.mostRecentTs = Math.max(existing.mostRecentTs, match.startTs);

    const timeControl = match.timeControl || "—";
    const timeControlEntry = existing.timeControlCounts.get(timeControl) ?? {
      count: 0,
      latestTs: Number.NEGATIVE_INFINITY,
    };
    timeControlEntry.count += 1;
    timeControlEntry.latestTs = Math.max(timeControlEntry.latestTs, match.startTs);
    existing.timeControlCounts.set(timeControl, timeControlEntry);

    rowsByOpponent.set(opponentKey, existing);
  });

  return [...rowsByOpponent.values()]
    .map(({ timeControlCounts, ...row }) => ({
      ...row,
      ...favoriteTimeControlFromCounts(timeControlCounts),
    }))
    .sort((left, right) => {
      const matchDifference = right.matchCount - left.matchCount;
      if (matchDifference !== 0) return matchDifference;
      const recencyDifference = right.mostRecentTs - left.mostRecentTs;
      if (recencyDifference !== 0) return recencyDifference;
      return left.opponent.localeCompare(right.opponent);
    });
};

const trophyLevels = [
  {
    maxRank: 1,
    key: "champion",
    imageSrc: profileTrophyAssets.champion,
    suffix: "Atomic Champion",
  },
  { maxRank: 10, key: "top10", imageSrc: profileTrophyAssets.top10, suffix: "Atomic Top 10" },
  { maxRank: 30, key: "top30", imageSrc: profileTrophyAssets.top30, suffix: "Atomic Top 30" },
];

const getProfileTrophies = (
  monthRanks: import("../../hooks/usePlayerProfileData").MonthRank[],
  currentMonthKey: string,
  ratingDisplayByMode: import("../../hooks/usePlayerProfileData").RatingDisplayByMode,
  username: string,
): Array<{
  key: string;
  mode: import("../../constants/matches").Mode;
  label: string;
  title: string;
  imageSrc: string;
  href: string;
}> =>
  modeOptions.flatMap((mode) => {
    const currentRank = Number(ratingDisplayByMode?.[mode]?.rank);
    if (!(currentRank > 0)) return [];

    const bestRank = monthRanks
      .filter((r) => r.monthKey === currentMonthKey && r.mode === mode)
      .reduce((lowest, r) => Math.min(lowest, r.rank), Number.POSITIVE_INFINITY);

    const level = trophyLevels.find(({ maxRank }) => bestRank <= maxRank);
    if (!level) return [];

    const modeLabel = modeLabels[mode] ?? mode;
    return [
      {
        key: `${mode}-${level.key}`,
        mode,
        label: modeLabel,
        title: `${modeLabel} ${level.suffix}`,
        imageSrc: level.imageSrc,
        href: lichessProfileUrl(username),
      },
    ];
  });

const getProfileAwcTrophies = (username: string) =>
  awcChampionTrophiesByUsername[
    normalizeUsername(username) as keyof typeof awcChampionTrophiesByUsername
  ] ?? [];

const LichessProfileIcon = () => (
  <svg viewBox="0 0 50 50" aria-hidden="true" focusable="false">
    <path
      d="M38.956.5c-3.53.418-6.452.902-9.286 2.984C5.534 1.786-.692 18.533.68 29.364 3.493 50.214 31.918 55.785 41.329 41.7c-7.444 7.696-19.276 8.752-28.323 3.084S-.506 27.392 4.683 17.567C9.873 7.742 18.996 4.535 29.03 6.405c2.43-1.418 5.225-3.22 7.655-3.187l-1.694 4.86 12.752 21.37c-.439 5.654-5.459 6.112-5.459 6.112-.574-1.47-1.634-2.942-4.842-6.036-3.207-3.094-17.465-10.177-15.788-16.207-2.001 6.967 10.311 14.152 14.04 17.663 3.73 3.51 5.426 6.04 5.795 6.756 0 0 9.392-2.504 7.838-8.927L37.4 7.171z"
      fill="currentColor"
    />
  </svg>
);

const buildMatchFilters = (
  username: string,
  filters: ProfileFilters,
): import("../../lib/supabase/supabaseMatchRows").MatchFilters => {
  const queryFilters: import("../../lib/supabase/supabaseMatchRows").MatchFilters = { username };
  const { timeControlInitialFilter, timeControlIncrementFilter } = filters;
  const timeControl =
    timeControlInitialFilter !== "all" && timeControlIncrementFilter !== "all"
      ? `${timeControlInitialFilter}+${timeControlIncrementFilter}`
      : "";

  if (timeControl) queryFilters.timeControl = timeControl;
  if (
    filters.opponentRatingMin !== defaultRatingMin ||
    filters.opponentRatingMax !== defaultRatingMax
  ) {
    queryFilters.opponentRatingMin = filters.opponentRatingMin;
    queryFilters.opponentRatingMax = filters.opponentRatingMax;
  }
  if (filters.startDateFilter) {
    queryFilters.startTs = parseDateInputBoundary(filters.startDateFilter, "start");
  }
  if (filters.endDateFilter) {
    queryFilters.endTs = parseDateInputBoundary(filters.endDateFilter, "end");
  }
  return queryFilters;
};

const isClientSidePagedSearch = (filters: { opponentFilter?: string }): boolean =>
  Boolean(String(filters?.opponentFilter || "").trim());

const createDefaultProfileFilters = (): ProfileFilters => ({
  opponentRatingMin: defaultRatingMin,
  opponentRatingMax: defaultRatingMax,
  opponentFilter: "",
  startDateFilter: "",
  endDateFilter: "",
  sourceFilters: { ...defaultSourceFilters },
  timeControlInitialFilter: "all",
  timeControlIncrementFilter: "all",
});

export const PlayerProfilePage = ({ username }: { username?: string }) => {
  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);
  const [matchHistoryMode, setMatchHistoryMode] =
    useState<import("../../constants/matches").Mode>(defaultMode);
  const [bestWinMode, setBestWinMode] =
    useState<import("../../constants/matches").Mode>(defaultMode);
  const [bestRankMode, setBestRankMode] =
    useState<import("../../constants/matches").Mode>(defaultMode);
  const [rankHistoryMode, setRankHistoryMode] = useState<RankHistoryMode>("all");
  const [profileHistoryTab, setProfileHistoryTab] = useState<ProfileHistoryTab>(() =>
    getProfileHistoryTabFromLocation(),
  );
  const [profileAliasEntry, setProfileAliasEntry] = useState<
    import("../../lib/supabase/supabaseAliases").MergedAliasRow | null
  >(null);
  const [aliasesLoaded, setAliasesLoaded] = useState(false);
  const [matchesByMode, setMatchesByMode] = useState(() => createModeRecord(() => []));
  const [totalMatchesByMode, setTotalMatchesByMode] = useState(() => createModeRecord(() => 0));
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedMatchKeys, setExpandedMatchKeys] = useState<string[]>([]);
  const [opponentRatingMin, setOpponentRatingMin] = useState(defaultRatingMin);
  const [opponentRatingMax, setOpponentRatingMax] = useState(defaultRatingMax);
  const [opponentFilter, setOpponentFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [sourceFilters, setSourceFilters] = useState(defaultSourceFilters);
  const [timeControlInitialFilter, setTimeControlInitialFilter] = useState("all");
  const [timeControlIncrementFilter, setTimeControlIncrementFilter] = useState("all");
  const [isHistoryAvailable, setIsHistoryAvailable] = useState(false);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [favoriteOpponentRows, setFavoriteOpponentRows] = useState<FavoriteOpponentRow[]>([]);
  const [favoriteOpponentMode, setFavoriteOpponentMode] = useState<RankHistoryMode>("all");
  const [favoriteOpponentMatchLimit, setFavoriteOpponentMatchLimit] = useState(
    favoriteOpponentDefaultMatchLimit,
  );
  const [favoriteOpponentDisplayCount, setFavoriteOpponentDisplayCount] = useState(25);
  const [favoriteOpponentLoadKey, setFavoriteOpponentLoadKey] = useState("");
  const [loadingFavoriteOpponents, setLoadingFavoriteOpponents] = useState(false);
  const [favoriteOpponentsError, setFavoriteOpponentsError] = useState("");
  const matchRequestIdRef = useRef(0);
  const favoriteOpponentsRequestIdRef = useRef(0);
  const searchSubmitInFlightRef = useRef(false);
  const canonicalUsername = profileAliasEntry?.username ?? normalizedUsername;
  const favoriteOpponentQueryKey = `${canonicalUsername}|${favoriteOpponentMode}|${favoriteOpponentMatchLimit}`;
  const isBanned = Boolean(profileAliasEntry?.banned);
  const ratingsSnapshotByMode = useRatingsSnapshotByMode(canonicalUsername);
  const monthRanks = useMonthRanks(canonicalUsername);
  const monthRankPlayerCounts = useMonthRankPlayerCounts(monthRanks);
  const [bestMonthRankCount, setBestMonthRankCount] = useState(5);
  const [recentMonthRankCount, setRecentMonthRankCount] = useState(5);
  const [bestWinCount, setBestWinCount] = useState(5);
  const [appliedFilters, setAppliedFilters] = useState(() => createDefaultProfileFilters());

  useEffect(() => {
    const defaultFilters = createDefaultProfileFilters();
    matchRequestIdRef.current += 1;
    searchSubmitInFlightRef.current = false;
    setMatchHistoryMode(defaultMode);
    setBestWinMode(defaultMode);
    setBestRankMode(defaultMode);
    setRankHistoryMode("all");
    setProfileHistoryTab(getProfileHistoryTabFromLocation());
    setPage(1);
    setError("");
    setFavoriteOpponentsError("");
    setLoadingMatches(false);
    setLoadingFavoriteOpponents(false);
    setExpandedMatchKeys([]);
    setMatchesByMode(createModeRecord(() => []));
    setTotalMatchesByMode(createModeRecord(() => 0));
    setFavoriteOpponentRows([]);
    setFavoriteOpponentMode("all");
    setFavoriteOpponentMatchLimit(favoriteOpponentDefaultMatchLimit);
    setFavoriteOpponentDisplayCount(25);
    setFavoriteOpponentLoadKey("");
    setOpponentRatingMin(defaultFilters.opponentRatingMin);
    setOpponentRatingMax(defaultFilters.opponentRatingMax);
    setOpponentFilter(defaultFilters.opponentFilter);
    setStartDateFilter(defaultFilters.startDateFilter);
    setEndDateFilter(defaultFilters.endDateFilter);
    setSourceFilters(defaultFilters.sourceFilters);
    setTimeControlInitialFilter(defaultFilters.timeControlInitialFilter);
    setTimeControlIncrementFilter(defaultFilters.timeControlIncrementFilter);
    setAppliedFilters(defaultFilters);
  }, [normalizedUsername]);

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
      if (!aliasesLoaded || !canonicalUsername) {
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
  }, [aliasesLoaded, canonicalUsername]);

  const runMatchSearch = useCallback(
    async (
      mode: import("../../constants/matches").Mode,
      nextAppliedFilters: ProfileFilters,
      nextPage: number = 1,
    ): Promise<void> => {
      const requestId = matchRequestIdRef.current + 1;
      matchRequestIdRef.current = requestId;
      setLoadingMatches(true);
      setError("");
      try {
        const filters = buildMatchFilters(canonicalUsername, nextAppliedFilters);
        const shouldClientPageResults = isClientSidePagedSearch(nextAppliedFilters);
        const rawMatches: import("../../lib/matches/matchData").ParsedMatch[] = [];
        let totalForServerPaging = 0;
        if (shouldClientPageResults) {
          const result = await loadRawMatchesByMode(mode, { filters });
          if (requestId !== matchRequestIdRef.current) return;
          rawMatches.push(...result);
          totalForServerPaging = result.length;
        } else {
          const result = await loadRawMatchesByMode(mode, { filters, page: nextPage, pageSize });
          if (requestId !== matchRequestIdRef.current) return;
          rawMatches.push(...result.matches);
          totalForServerPaging = result.total;
        }
        const normalizedMatchesForMode = normalizeMatches(rawMatches, canonicalUsername);
        setMatchesByMode((current) => ({
          ...current,
          [mode]: normalizedMatchesForMode,
        }));
        setTotalMatchesByMode((current) => ({
          ...current,
          [mode]: shouldClientPageResults ? normalizedMatchesForMode.length : totalForServerPaging,
        }));
        setAppliedFilters(nextAppliedFilters);
        setPage(nextPage);
      } catch (loadError) {
        if (requestId !== matchRequestIdRef.current) return;
        setMatchesByMode((current) => ({
          ...current,
          [mode]: [],
        }));
        setTotalMatchesByMode((current) => ({
          ...current,
          [mode]: 0,
        }));
        setError(String(loadError));
      } finally {
        if (requestId === matchRequestIdRef.current) {
          setLoadingMatches(false);
        }
      }
    },
    [canonicalUsername, pageSize],
  );

  const loadFavoriteOpponents = useCallback(async (): Promise<void> => {
    const requestId = favoriteOpponentsRequestIdRef.current + 1;
    favoriteOpponentsRequestIdRef.current = requestId;
    setLoadingFavoriteOpponents(true);
    setFavoriteOpponentsError("");

    try {
      const modesToLoad = favoriteOpponentMode === "all" ? modeOptions : [favoriteOpponentMode];
      const matchesByMode = await Promise.all(
        modesToLoad.map(async (mode): Promise<FavoriteOpponentMatch[]> => {
          const modeMatches: import("../../lib/matches/matchData").ParsedMatch[] = [];
          const maxPages = Math.ceil(favoriteOpponentMatchLimit / favoriteOpponentPageSize);

          for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
            const result = await loadRawMatchesByMode(mode, {
              filters: { username: canonicalUsername },
              page: pageNumber,
              pageSize: favoriteOpponentPageSize,
            });
            modeMatches.push(...result.matches);
            if (result.matches.length < favoriteOpponentPageSize) break;
          }

          return normalizeMatches(modeMatches, canonicalUsername).map((match) => ({
            ...match,
            mode,
          }));
        }),
      );

      if (requestId !== favoriteOpponentsRequestIdRef.current) return;

      const recentMatches = matchesByMode
        .flat()
        .sort((left, right) => right.startTs - left.startTs)
        .slice(0, favoriteOpponentMatchLimit);

      setFavoriteOpponentRows(getFavoriteOpponentRows(recentMatches));
      setFavoriteOpponentLoadKey(favoriteOpponentQueryKey);
    } catch (loadError) {
      if (requestId !== favoriteOpponentsRequestIdRef.current) return;
      setFavoriteOpponentRows([]);
      setFavoriteOpponentLoadKey("");
      setFavoriteOpponentsError(String(loadError));
    } finally {
      if (requestId === favoriteOpponentsRequestIdRef.current) {
        setLoadingFavoriteOpponents(false);
      }
    }
  }, [
    canonicalUsername,
    favoriteOpponentMatchLimit,
    favoriteOpponentMode,
    favoriteOpponentQueryKey,
  ]);

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
    if (!aliasesLoaded || isBanned) return;
    void runMatchSearch(matchHistoryMode, appliedFilters, requestedServerPage);
  }, [
    aliasesLoaded,
    appliedFilters,
    isBanned,
    matchHistoryMode,
    requestedServerPage,
    runMatchSearch,
  ]);

  useEffect(() => {
    if (!aliasesLoaded || isBanned || profileHistoryTab !== "opponents") return;
    if (favoriteOpponentLoadKey === favoriteOpponentQueryKey || loadingFavoriteOpponents) return;
    void loadFavoriteOpponents();
  }, [
    aliasesLoaded,
    canonicalUsername,
    favoriteOpponentLoadKey,
    favoriteOpponentQueryKey,
    isBanned,
    loadFavoriteOpponents,
    loadingFavoriteOpponents,
    profileHistoryTab,
  ]);

  const handleSearchClick = () => {
    if (searchSubmitInFlightRef.current || loadingMatches) return;
    searchSubmitInFlightRef.current = true;
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
    searchSubmitInFlightRef.current = false;
  };
  const setSourceFilter = (
    source: keyof import("../../constants/matches").SourceFilters,
    checked: boolean,
  ): void => {
    setSourceFilters((current) => ({ ...current, [source]: checked }));
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

    if (typeof window === "undefined") return;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("tab", nextTab);
    window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  };

  useEffect(() => {
    if (isBanned) return;

    if (currentPage !== page) {
      setPage(currentPage);
    }
  }, [currentPage, isBanned, page]);

  const ratingDisplayByMode = useMemo(
    () => getRatingDisplayByMode(ratingsSnapshotByMode, canonicalUsername),
    [ratingsSnapshotByMode, canonicalUsername],
  );
  const bestWins = useMemo(
    () => getBestWinsForMode(ratingDisplayByMode, bestWinMode, bestWinCount),
    [bestWinCount, bestWinMode, ratingDisplayByMode],
  );
  const bestRankMonthRanks = useMemo(
    () => getMonthRanksForMode(monthRanks, bestRankMode),
    [bestRankMode, monthRanks],
  );
  const bestMonthRanks = useMemo(
    () =>
      getMonthRankHighlights(bestRankMonthRanks, bestMonthRankCount, recentMonthRankCount)
        .bestMonthRanks,
    [bestRankMonthRanks, bestMonthRankCount, recentMonthRankCount],
  );
  const recentMonthRanks = useMemo(
    () =>
      getMonthRankHighlights(monthRanks, bestMonthRankCount, recentMonthRankCount).recentMonthRanks,
    [bestMonthRankCount, monthRanks, recentMonthRankCount],
  );
  const rankHistoryRows = useMemo(
    () =>
      getMonthRanksForMode(monthRanks, rankHistoryMode)
        .map((monthRank) => ({
          ...monthRank,
          playerCount: monthRankPlayerCounts[`${monthRank.monthValue}|${monthRank.mode}`] ?? null,
        }))
        .sort((a, b) => {
          const dateDifference = b.monthDate.getTime() - a.monthDate.getTime();
          if (dateDifference !== 0) return dateDifference;
          return modeOptions.indexOf(a.mode) - modeOptions.indexOf(b.mode);
        }),
    [monthRankPlayerCounts, monthRanks, rankHistoryMode],
  );
  const visibleFavoriteOpponentRows = useMemo(
    () => favoriteOpponentRows.slice(0, favoriteOpponentDisplayCount),
    [favoriteOpponentDisplayCount, favoriteOpponentRows],
  );
  const favoriteOpponentScopeLabel =
    favoriteOpponentMode === "all"
      ? "matches overall"
      : `${modeLabels[favoriteOpponentMode] ?? favoriteOpponentMode} matches`;
  const aliasesForUser = useMemo(() => {
    if (!aliasesLoaded) return [];

    const aliases = Array.isArray(profileAliasEntry?.aliases) ? profileAliasEntry.aliases : [];
    return [...new Set([canonicalUsername, ...aliases])];
  }, [aliasesLoaded, canonicalUsername, profileAliasEntry]);
  const profileOpenings = useMemo(() => {
    if (!aliasesLoaded || !Array.isArray(profileAliasEntry?.openings)) return [];

    return [
      ...new Set(
        profileAliasEntry.openings.map((opening) => String(opening || "").trim()).filter(Boolean),
      ),
    ];
  }, [aliasesLoaded, profileAliasEntry]);
  const aliasDisplayRows = useMemo(() => {
    const countableAliases = new Set(profileAliasEntry?.countableAliases ?? aliasesForUser);
    return aliasesForUser.map((alias) => ({
      alias,
      isCounted: countableAliases.has(alias),
    }));
  }, [aliasesForUser, profileAliasEntry]);
  const latestMonthKeyByMode = useMemo(
    () =>
      monthRanks.reduce<
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
    [monthRanks],
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
      ),
    [latestMonthKeyByMode, ratingDisplayByMode],
  );
  const currentMonthKey = getCurrentMonthKey();
  const profileTrophies = useMemo(
    () => [
      ...getProfileTrophies(monthRanks, currentMonthKey, ratingDisplayByMode, canonicalUsername),
      ...getProfileAwcTrophies(canonicalUsername),
    ],
    [canonicalUsername, currentMonthKey, monthRanks, ratingDisplayByMode],
  );

  const toggleMatchKey = (key: string): void => {
    setExpandedMatchKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  };

  return (
    <div className="rankingsPage">
      <Seo
        title={`${canonicalUsername} Atomic Chess Profile`}
        description={`View ${canonicalUsername}'s atomic chess profile, ratings, monthly ranks, best wins, aliases, and recent matches.`}
        path={`/@/${encodeURIComponent(canonicalUsername)}`}
      />
      <div className="panel rankingsPanel playerProfilePanel">
        <div
          className={`profileIdentityRow${!isBanned && profileTrophies.length ? "" : " noTrophies"}`}
        >
          <div className="profileIdentityTitle">
            <h1>{canonicalUsername}</h1>
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
          {!isBanned && profileTrophies.length ? (
            <div className="profileTrophyRow" aria-label="Atomic ranking trophies">
              {profileTrophies.map((trophy) =>
                isExternalHref(trophy.href) ? (
                  <a
                    key={trophy.key}
                    className="profileTrophy"
                    title={trophy.title}
                    aria-label={trophy.title}
                    href={trophy.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <img src={trophy.imageSrc} alt="" aria-hidden="true" />
                    <span className="profileTrophyLabel">{trophy.label}</span>
                  </a>
                ) : (
                  <Link
                    key={trophy.key}
                    className="profileTrophy"
                    title={trophy.title}
                    aria-label={trophy.title}
                    to={trophy.href}
                  >
                    <img src={trophy.imageSrc} alt="" aria-hidden="true" />
                    <span className="profileTrophyLabel">{trophy.label}</span>
                  </Link>
                ),
              )}
            </div>
          ) : null}
        </div>

        {isBanned ? (
          <section className="profileBanNotice" aria-labelledby="profile-ban-notice-title">
            <div className="profileBanNoticeHeader">
              <span className="profileBanBadge">Fair Play Ban</span>
              <h2 id="profile-ban-notice-title">
                This player was banned by Lichess for fair play violations.
              </h2>
            </div>
            <p>
              This player was banned by Lichess for fair play violations, so we do not include them
              in the rating or ranking system here.
            </p>
          </section>
        ) : (
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
        )}

        {isHistoryAvailable ? (
          <div className="profileActionRow">
            <Link
              className="profilePuzzleDashboardLink"
              to="/@/$username/puzzles"
              params={{ username: canonicalUsername }}
            >
              View puzzle dashboard
            </Link>
          </div>
        ) : null}

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
                        if ((modeOptions as readonly string[]).includes(v)) {
                          setBestWinMode(v as import("../../constants/matches").Mode);
                        }
                      }}
                    >
                      {modeOptions.map((mode) => (
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
                <div className="emptyRankings">No wins available in {modeLabels[bestWinMode]}.</div>
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
                {aliasDisplayRows.map(({ alias, isCounted }) => (
                  <div key={`alias-${alias}`} className="profileAliasRow">
                    <span className="profileAliasName">
                      <span>{alias}</span>
                      {!isCounted ? (
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
                      className="profileAliasLichessLink"
                      href={lichessProfileUrl(alias)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${alias} on Lichess`}
                      title={`Open ${alias} on Lichess`}
                    >
                      <LichessProfileIcon />
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {!isBanned ? (
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
                        if ((modeOptions as readonly string[]).includes(v)) {
                          setBestRankMode(v as import("../../constants/matches").Mode);
                        }
                      }}
                    >
                      {modeOptions.map((mode) => (
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
              </div>

              <section
                id="profile-match-history-panel"
                className="profileHistorySection"
                role="tabpanel"
                aria-labelledby="profile-match-history-tab"
                hidden={profileHistoryTab !== "matches"}
              >
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
                    <label htmlFor="profile-opponent-filter" className="profileOpponentFilterField">
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
                        className="analyzeButton matchFilterSearch"
                        type="submit"
                        disabled={loadingMatches}
                      >
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
                          if ((modeOptions as readonly string[]).includes(v)) {
                            handleModeChange(v as import("../../constants/matches").Mode);
                          }
                        }}
                      >
                        {modeOptions.map((mode) => (
                          <option key={mode} value={mode}>
                            {modeLabels[mode] ?? mode}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <span>
                    {filteredMatches.length} filtered / {matches.length} total
                  </span>
                </div>

                <div className="rankingsTableWrap profileMatchTableWrap">
                  <table className="rankingsTable profileMatchTable">
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
                                <span className="profileMetricValue">{match.beforeRating}</span>
                                <span className="profileDelta">
                                  {formatSignedDecimal(match.ratingChange)}
                                </span>
                              </td>
                              <td>
                                <span className="profileMetricValue">{match.beforeRd}</span>
                                <span className="profileDelta">
                                  {formatSignedDecimal(match.rdChange)}
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
              </section>

              <section
                id="profile-rank-history-panel"
                className="profileHistorySection"
                role="tabpanel"
                aria-labelledby="profile-rank-history-tab"
                hidden={profileHistoryTab !== "ranks"}
              >
                <div className="rankingsMeta profileHistoryMeta">
                  <div className="profileHistoryTitleControl">
                    <label htmlFor="profile-rank-history-mode-select">
                      <span>Mode</span>
                      <select
                        id="profile-rank-history-mode-select"
                        aria-label="Rank history mode"
                        value={rankHistoryMode}
                        onChange={(event) => {
                          const v = event.target.value;
                          if (v === "all" || (modeOptions as readonly string[]).includes(v)) {
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
                  </div>
                  <span>{rankHistoryRows.length} months</span>
                </div>

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
              </section>

              <section
                id="profile-favorite-opponents-panel"
                className="profileHistorySection"
                role="tabpanel"
                aria-labelledby="profile-favorite-opponents-tab"
                hidden={profileHistoryTab !== "opponents"}
              >
                <div className="rankingsMeta profileHistoryMeta profileFavoriteOpponentsMeta">
                  <div className="profileFavoriteOpponentsControls">
                    <label htmlFor="profile-favorite-opponents-mode-select">
                      <span>Mode</span>
                      <select
                        id="profile-favorite-opponents-mode-select"
                        aria-label="Favorite opponents mode"
                        value={favoriteOpponentMode}
                        disabled={loadingFavoriteOpponents}
                        onChange={(event) => {
                          const v = event.target.value;
                          if (v === "all" || (modeOptions as readonly string[]).includes(v)) {
                            setFavoriteOpponentMode(v as RankHistoryMode);
                          }
                        }}
                      >
                        {favoriteOpponentModeOptions.map((mode) => (
                          <option key={mode} value={mode}>
                            {mode === "all" ? "All" : (modeLabels[mode] ?? mode)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor="profile-favorite-opponents-match-limit-select">
                      <span>Last</span>
                      <select
                        id="profile-favorite-opponents-match-limit-select"
                        aria-label="Favorite opponents last matches sample"
                        value={favoriteOpponentMatchLimit}
                        disabled={loadingFavoriteOpponents}
                        onChange={(event) =>
                          setFavoriteOpponentMatchLimit(Number(event.target.value))
                        }
                      >
                        {favoriteOpponentMatchLimitOptions.map((count) => (
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
                        value={favoriteOpponentDisplayCount}
                        onChange={(event) =>
                          setFavoriteOpponentDisplayCount(Number(event.target.value))
                        }
                      >
                        {favoriteOpponentDisplayCountOptions.map((count) => (
                          <option key={count} value={count}>
                            {count}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                {favoriteOpponentsError ? (
                  <div className="errorText">{favoriteOpponentsError}</div>
                ) : null}

                <div className="rankingsTableWrap profileFavoriteOpponentsTableWrap">
                  <table className="rankingsTable profileFavoriteOpponentsTable">
                    <thead>
                      <tr>
                        <th>Opponent</th>
                        <th>Matches</th>
                        <th>H2H Score</th>
                        <th>Most Recent</th>
                        <th>Most Played TC</th>
                        <th aria-label="Open H2H page" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFavoriteOpponentRows.map((row) => (
                        <tr key={`favorite-opponent-${normalizeUsername(row.opponent)}`}>
                          <td>
                            <Link
                              className="rankingLink"
                              to="/@/$username"
                              params={{ username: row.opponent }}
                            >
                              {row.opponent}
                            </Link>
                          </td>
                          <td>{row.matchCount.toLocaleString("en-US")}</td>
                          <td>
                            {formatScore(row.playerScore)} - {formatScore(row.opponentScore)}
                          </td>
                          <td>{formatLocalDateTime(row.mostRecentTs)}</td>
                          <td>
                            {row.favoriteTimeControl}
                            {row.favoriteTimeControlCount > 0
                              ? ` (${row.favoriteTimeControlCount})`
                              : ""}
                          </td>
                          <td>
                            <Link
                              className="matchPageLink"
                              to="/h2h/$matchup"
                              params={{ matchup: matchupToSlug(canonicalUsername, row.opponent) }}
                              target="_blank"
                              rel="noreferrer"
                              title={`Open H2H: ${canonicalUsername} vs ${row.opponent}`}
                              aria-label={`Open H2H: ${canonicalUsername} vs ${row.opponent}`}
                            >
                              <FontAwesomeIcon icon={faUpRightFromSquare} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {loadingFavoriteOpponents ? (
                        <tr>
                          <td colSpan={6} className="emptyRankings">
                            {`Loading favorite opponents from the last ${favoriteOpponentMatchLimit.toLocaleString("en-US")} ${favoriteOpponentScopeLabel}...`}
                          </td>
                        </tr>
                      ) : null}
                      {!loadingFavoriteOpponents && favoriteOpponentRows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="emptyRankings">
                            {`No favorite opponents found in the last ${favoriteOpponentMatchLimit.toLocaleString("en-US")} ${favoriteOpponentScopeLabel}.`}
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
