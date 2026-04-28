import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import "./PlayerProfile.css";
import {
  createModeRecord,
  defaultMode,
  defaultRatingMax,
  defaultRatingMin,
  defaultSourceFilters,
  matchLengthBoundsByMode,
  modeDescriptions,
  modeLabels,
  modeOptions,
  opponentRatingSliderMax,
  opponentRatingSliderMin,
  pageSizeOptions,
} from "../../constants/matches";
import { fetchProfileAliasRow } from "../../lib/supabase/supabaseAliases";
import { isRegisteredSiteUser } from "../../lib/supabase/supabaseUsers";
import { toBoundedLengthRange, useMatchLengthRange } from "../../hooks/useMatchLengthRange";
import {
  buildRankingsLocation,
  filterMatches,
  getBestWinsForMode,
  getMonthRankHighlights,
  getProfileMetricCardRows,
  getRatingDisplayByMode,
  useMonthRanks,
  useRatingsSnapshotByMode,
} from "../../hooks/usePlayerProfileData";
import { monthKeyFromMonthValue } from "../../lib/supabase/supabaseLb";
import {
  formatLocalDateTime,
  formatOpponentWithRating,
  formatScore,
  formatSignedDecimal,
} from "../../utils/formatters";
import { scoreToneClass } from "../../utils/matchPresentation";
import { normalizeUsername } from "../../utils/playerNames";
import { MatchPageLink } from "../../components/MatchPageLink/MatchPageLink";
import { isToggleActionKey } from "../../utils/toggleActionKey";
import { parseDateInputBoundary } from "../../utils/matchFilters";
import { loadRawMatchesByMode, normalizeMatches } from "../../lib/matches/matchData";
import { appAssetPath } from "../../utils/appAssetPath";
import { getTimeControlOptions } from "../../utils/matchCollection";
import { DualRangeSlider } from "../../components/DualRangeSlider/DualRangeSlider";
import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { ProfileMetricCard } from "../../components/ProfileMetricCard/ProfileMetricCard";
import { SourceFilterChecks } from "../../components/SourceFilterChecks/SourceFilterChecks";
import { TimeControlFields } from "../../components/TimeControlFields/TimeControlFields";
import { Seo } from "../../components/Seo/Seo";

const countOptions = [5, 10, 20];

type ProfileFilters = {
  matchLengthMin: number;
  matchLengthMax: number;
  opponentRatingMin: number;
  opponentRatingMax: number;
  opponentFilter: string;
  startDateFilter: string;
  endDateFilter: string;
  sourceFilters: import("../../constants/matches").SourceFilters;
  timeControlInitialFilter: string;
  timeControlIncrementFilter: string;
};

const lichessProfileUrl = (username: string): string =>
  `https://lichess.org/@/${encodeURIComponent(String(username || "").trim())}`;

const isExternalHref = (href: string): boolean => /^https?:\/\//i.test(String(href || "").trim());

const NON_COUNTED_ALIAS_MESSAGE =
  "This account is marked as a drunk account and is not included in the rating system.";

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

const trophyLevels = [
  { maxRank: 1, key: "champion", imageSrc: profileTrophyAssets.champion, suffix: "Atomic Champion" },
  { maxRank: 10, key: "top10", imageSrc: profileTrophyAssets.top10, suffix: "Atomic Top 10" },
  { maxRank: 30, key: "top30", imageSrc: profileTrophyAssets.top30, suffix: "Atomic Top 30" },
];

const getProfileTrophies = (monthRanks: import("../../hooks/usePlayerProfileData").MonthRank[], currentMonthKey: string, ratingDisplayByMode: import("../../hooks/usePlayerProfileData").RatingDisplayByMode, username: string): Array<{ key: string; mode: import("../../constants/matches").Mode; label: string; title: string; imageSrc: string; href: string }> =>
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
  awcChampionTrophiesByUsername[normalizeUsername(username) as keyof typeof awcChampionTrophiesByUsername] ?? [];

const LichessProfileIcon = () => (
  <svg viewBox="0 0 50 50" aria-hidden="true" focusable="false">
    <path
      d="M38.956.5c-3.53.418-6.452.902-9.286 2.984C5.534 1.786-.692 18.533.68 29.364 3.493 50.214 31.918 55.785 41.329 41.7c-7.444 7.696-19.276 8.752-28.323 3.084S-.506 27.392 4.683 17.567C9.873 7.742 18.996 4.535 29.03 6.405c2.43-1.418 5.225-3.22 7.655-3.187l-1.694 4.86 12.752 21.37c-.439 5.654-5.459 6.112-5.459 6.112-.574-1.47-1.634-2.942-4.842-6.036-3.207-3.094-17.465-10.177-15.788-16.207-2.001 6.967 10.311 14.152 14.04 17.663 3.73 3.51 5.426 6.04 5.795 6.756 0 0 9.392-2.504 7.838-8.927L37.4 7.171z"
      fill="currentColor"
    />
  </svg>
);

const buildMatchFilters = (username: string, filters: ProfileFilters): import("../../lib/supabase/supabaseMatchRows").MatchFilters => {
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

const isClientSidePagedSearch = (filters: { opponentFilter?: string }): boolean => Boolean(String(filters?.opponentFilter || "").trim());

const createDefaultProfileFilters = (mode: import("../../constants/matches").Mode = defaultMode): ProfileFilters => {
  const matchLengthRange = toBoundedLengthRange(mode);

  return {
    matchLengthMin: matchLengthRange.min,
    matchLengthMax: matchLengthRange.max,
    opponentRatingMin: defaultRatingMin,
    opponentRatingMax: defaultRatingMax,
    opponentFilter: "",
    startDateFilter: "",
    endDateFilter: "",
    sourceFilters: { ...defaultSourceFilters },
    timeControlInitialFilter: "all",
    timeControlIncrementFilter: "all",
  };
};

export const PlayerProfilePage = ({ username }: { username?: string }) => {
  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);
  const [selectedMode, setSelectedMode] = useState<import("../../constants/matches").Mode>(defaultMode);
  const [profileAliasEntry, setProfileAliasEntry] = useState<import("../../lib/supabase/supabaseAliases").MergedAliasRow | null>(null);
  const [aliasesLoaded, setAliasesLoaded] = useState(false);
  const [matchesByMode, setMatchesByMode] = useState(() => createModeRecord(() => []));
  const [totalMatchesByMode, setTotalMatchesByMode] = useState(() => createModeRecord(() => 0));
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedMatchKeys, setExpandedMatchKeys] = useState<string[]>([]);
  const { matchLengthMin, setMatchLengthMin, matchLengthMax, setMatchLengthMax } =
    useMatchLengthRange(selectedMode);
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
  const matchRequestIdRef = useRef(0);
  const searchSubmitInFlightRef = useRef(false);
  const canonicalUsername = profileAliasEntry?.username ?? normalizedUsername;
  const isBanned = Boolean(profileAliasEntry?.banned);
  const ratingsSnapshotByMode = useRatingsSnapshotByMode(canonicalUsername);
  const monthRanks = useMonthRanks(canonicalUsername);
  const [bestMonthRankCount, setBestMonthRankCount] = useState(5);
  const [recentMonthRankCount, setRecentMonthRankCount] = useState(5);
  const [bestWinCount, setBestWinCount] = useState(5);
  const [appliedFilters, setAppliedFilters] = useState(() => createDefaultProfileFilters());
  const matchLengthBounds =
    matchLengthBoundsByMode[selectedMode] ?? matchLengthBoundsByMode[defaultMode];

  useEffect(() => {
    const defaultFilters = createDefaultProfileFilters(defaultMode);
    matchRequestIdRef.current += 1;
    searchSubmitInFlightRef.current = false;
    setSelectedMode(defaultMode);
    setPage(1);
    setError("");
    setLoadingMatches(false);
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
    setMatchLengthMin(defaultFilters.matchLengthMin);
    setMatchLengthMax(defaultFilters.matchLengthMax);
    setAppliedFilters(defaultFilters);
  }, [normalizedUsername, setMatchLengthMax, setMatchLengthMin]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [normalizedUsername]);

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

    loadProfileAliasEntry();

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

    loadHistoryAvailability();

    return () => {
      isCurrent = false;
    };
  }, [aliasesLoaded, canonicalUsername]);

  const runMatchSearch = useCallback(async (mode: import("../../constants/matches").Mode, nextAppliedFilters: ProfileFilters, nextPage: number = 1): Promise<void> => {
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
  }, [canonicalUsername, pageSize]);

  useEffect(() => {
    setExpandedMatchKeys([]);
  }, [page, selectedMode, appliedFilters, canonicalUsername]);

  const matches = matchesByMode[selectedMode] ?? [];

  const { initialOptions, incrementOptions } = useMemo(
    () => getTimeControlOptions(matches),
    [matches],
  );
  const filteredMatches = useMemo(
    () => filterMatches(matches, appliedFilters, selectedMode),
    [matches, appliedFilters, selectedMode],
  );
  const isClientPagedResults = isClientSidePagedSearch(appliedFilters);
  const totalPages = Math.max(
    1,
    Math.ceil(
      (isClientPagedResults ? filteredMatches.length : totalMatchesByMode[selectedMode] ?? 0) /
        Math.max(1, pageSize),
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
    runMatchSearch(selectedMode, appliedFilters, requestedServerPage);
  }, [aliasesLoaded, appliedFilters, isBanned, requestedServerPage, runMatchSearch, selectedMode]);

  const handleSearchClick = () => {
    if (searchSubmitInFlightRef.current || loadingMatches) return;
    searchSubmitInFlightRef.current = true;
    setPage(1);
    setAppliedFilters({
      matchLengthMin,
      matchLengthMax,
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
  const setSourceFilter = (source: keyof import("../../constants/matches").SourceFilters, checked: boolean): void => {
    setSourceFilters((current) => ({ ...current, [source]: checked }));
  };
  const handleModeChange = (nextMode: import("../../constants/matches").Mode): void => {
    const nextModeFilters = createDefaultProfileFilters(nextMode);

    setSelectedMode(nextMode);
    setPage(1);
    setTimeControlInitialFilter(nextModeFilters.timeControlInitialFilter);
    setTimeControlIncrementFilter(nextModeFilters.timeControlIncrementFilter);
    setMatchLengthMin(nextModeFilters.matchLengthMin);
    setMatchLengthMax(nextModeFilters.matchLengthMax);
    setAppliedFilters((current) => ({
      ...current,
      matchLengthMin: nextModeFilters.matchLengthMin,
      matchLengthMax: nextModeFilters.matchLengthMax,
      timeControlInitialFilter: nextModeFilters.timeControlInitialFilter,
      timeControlIncrementFilter: nextModeFilters.timeControlIncrementFilter,
    }));
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
    () => getBestWinsForMode(ratingDisplayByMode, selectedMode, bestWinCount),
    [bestWinCount, ratingDisplayByMode, selectedMode],
  );
  const { bestMonthRanks, recentMonthRanks } = useMemo(
    () => getMonthRankHighlights(monthRanks, bestMonthRankCount, recentMonthRankCount),
    [monthRanks, bestMonthRankCount, recentMonthRankCount],
  );
  const aliasesForUser = useMemo(() => {
    if (!aliasesLoaded) return [];

    const aliases = Array.isArray(profileAliasEntry?.aliases) ? profileAliasEntry.aliases : [];
    return [...new Set([canonicalUsername, ...aliases])];
  }, [aliasesLoaded, canonicalUsername, profileAliasEntry]);
  const aliasDisplayRows = useMemo(() => {
    const countableAliases = new Set(profileAliasEntry?.countableAliases ?? aliasesForUser);
    return aliasesForUser.map((alias) => ({
      alias,
      isCounted: countableAliases.has(alias),
    }));
  }, [aliasesForUser, profileAliasEntry]);
  const latestMonthKeyByMode = useMemo(
    () =>
      monthRanks.reduce<Partial<Record<import("../../constants/matches").Mode, import("../../hooks/usePlayerProfileData").MonthRank>>>(
        (acc, monthRank) => {
          const existing = acc[monthRank.mode];
          if (!existing || monthRank.monthDate > existing.monthDate) {
            acc[monthRank.mode] = monthRank;
          }
          return acc;
        },
        {},
      ),
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
        <div className="profileIdentityRow">
          <h1>{canonicalUsername}</h1>
          {!isBanned && profileTrophies.length ? (
            <div className="profileTrophyRow" aria-label="Atomic ranking trophies">
              {profileTrophies.map((trophy) => (
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
                )
              ))}
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
              {bestWins.length === 0 ? (
                <div className="emptyRankings">No wins available in {selectedMode}.</div>
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
              {bestMonthRanks.length === 0 ? (
                <div className="emptyRankings">No monthly ranks available in {selectedMode}.</div>
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
                      <span className="profileBestMonthRankRating">{monthRank.rating}</span>
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
                      <span className="profileBestMonthRankRating">{monthRank.rating}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        ) : null}

        {!isBanned ? (
          <>
            <form
              className="matchFilterPanel profileMatchFilters"
              onSubmit={(event) => {
                event.preventDefault();
                handleSearchClick();
              }}
            >
              <div className="matchFilterGrid">
                <label htmlFor="profile-mode-select">
                  Mode
                  <select
                    id="profile-mode-select"
                    value={selectedMode}
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
                  <span className="controlHint">{modeDescriptions[selectedMode]}</span>
                </label>
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

                <DualRangeSlider
                  id="match-length-min"
                  label={`Match length range: ${matchLengthMin} - ${
                    matchLengthMax >= matchLengthBounds.max
                      ? `${matchLengthBounds.max}+`
                      : matchLengthMax
                  }`}
                  min={matchLengthBounds.min}
                  max={matchLengthBounds.max}
                  lowerValue={matchLengthMin}
                  upperValue={matchLengthMax}
                  onLowerChange={setMatchLengthMin}
                  onUpperChange={setMatchLengthMax}
                />
              </div>

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
            </form>

            {error ? <div className="errorText">{error}</div> : null}

            <div className="rankingsMeta">
              <span>Match History ({selectedMode})</span>
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
                              {formatOpponentWithRating(match.opponent, match.opponentAfterRating)}
                            </Link>
                          </td>
                          <td>
                            <span className="profileTablePill">{match.timeControl}</span>
                          </td>
                          <td className="scoreCell">
                            <span className="profileScoreBox">
                              <span
                                className={`profileScoreValue${scoreToneClass(
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
                                mode: selectedMode,
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
                                <div className="matchCardPlayerStats profileMatchPlayerStats">
                                  <div>
                                    <strong>{canonicalUsername}</strong>
                                    <span>
                                      {`Rating ${match.beforeRating} (${formatSignedDecimal(
                                        match.ratingChange,
                                      )})`}
                                    </span>
                                    <span>
                                      {`RD ${match.beforeRd} (${formatSignedDecimal(match.rdChange)})`}
                                    </span>
                                  </div>
                                  <div>
                                    <strong>{match.opponent}</strong>
                                    <span>
                                      {`Rating ${match.opponentBeforeRating} (${formatSignedDecimal(
                                        match.opponentAfterRating - match.opponentBeforeRating,
                                      )})`}
                                    </span>
                                    <span>
                                      {`RD ${match.opponentBeforeRd} (${formatSignedDecimal(
                                        match.opponentAfterRd - match.opponentBeforeRd,
                                      )})`}
                                    </span>
                                  </div>
                                </div>
                                <div className="matchGames profileMatchGames">
                                  <div className="matchGamesHeader profileMatchGameHeader">
                                    <strong>Game</strong>
                                    <strong>Result</strong>
                                    <strong>Score</strong>
                                    <strong>ID</strong>
                                  </div>
                                  <ul className="matchGamesList profileMatchGamesList">
                                    {match.games.map((game, index) => (
                                      <li
                                        key={`${matchKey}-${game.id}-${index}`}
                                        className="matchGameRow profileMatchGame"
                                      >
                                        <span>Game {index + 1}</span>
                                        <span>{game.winner}</span>
                                        <span>{`${formatScore(game.playerScoreAfter)} - ${formatScore(
                                          game.opponentScoreAfter,
                                        )}`}</span>
                                        <span>
                                          <LichessGameLink gameId={game.id}>
                                            {game.id}
                                          </LichessGameLink>
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                  {visibleMatches.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="emptyRankings">
                        No matches found for this player with current filters in {selectedMode}.
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
      </div>
    </div>
  );
};
