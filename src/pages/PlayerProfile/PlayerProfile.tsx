import "../../components/MatchHistoryTable/MatchHistoryTable.css";
import "./PlayerProfile.css";

import {
  faBeerMugEmpty,
  faChartLine,
  faClockRotateLeft,
  faComment,
  faEllipsisVertical,
  faPuzzlePiece,
  faShieldHalved,
  faTrophy,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { CoinProfileActions } from "../../components/CoinProfileActions/CoinProfileActions";
import { CommunityCommentCount } from "../../components/CommunityCommentsLink/CommunityCommentsLink";
import { LichessGameLink } from "../../components/LichessGameLink/LichessGameLink";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { ProfileMetricCard } from "../../components/ProfileMetricCard/ProfileMetricCard";
import { Seo } from "../../components/Seo/Seo";
import { TournamentPlayerLink } from "../../components/TournamentPlayerLink/TournamentPlayerLink";
import { defaultMode, modeLabels, modeOptions, publicModeOptions } from "../../constants/matches";
import { useAppSettings } from "../../context/AppSettings";
import type { RankHistoryMode } from "../../features/profile/favoriteOpponents";
import { FavoriteOpponentsSection } from "../../features/profile/FavoriteOpponentsSection";
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
  LichessProfileIcon,
  NON_COUNTED_ALIAS_MESSAGE,
  PyChessProfileIcon,
} from "../../features/profile/profilePresentation";
import { getVisibleProfileRatingModes } from "../../features/profile/profileRatingModes";
import {
  fetchChampionshipTrophies,
  getCurrentMonthKey,
  getProfileHeaderTrophies,
  getProfileRankingMonthKey,
  getPublishedProfileRankingTrophies,
  getPuzzleRankingTrophies,
  getRankingTrophies,
  ProfileTrophyLink,
  sortProfileTrophies,
  type TrophyCaseSort,
  trophyCaseSortStorageKey,
} from "../../features/profile/profileTrophies";
import { useFavoriteOpponentsModel } from "../../features/profile/useFavoriteOpponentsModel";
import { usePersistedState } from "../../hooks/usePersistedState";
import {
  buildRankingsLocation,
  getBestWinsForMode,
  getMonthRankHighlights,
  getMonthRanksForMode,
  getProfileMetricCardRows,
  getRatingDisplayByMode,
  useMonthRankPlayerCounts,
  useMonthRanks,
  useRatingsSnapshotByMode,
} from "../../hooks/usePlayerProfileData";
import {
  type AliasAccount,
  type AliasIdentityRow,
  getAliasIdentityUsernames,
} from "../../lib/archive/aliases";
import { atomicTourPlayerRankingStatsQueryOptions } from "../../lib/atomicTour/queries";
import { inferExternalGameSource } from "../../lib/matches/routes";
import { playerSocialQueryOptions } from "../../lib/playerSocial/playerSocial";
import { puzzleRankingTrophiesQueryOptions } from "../../lib/puzzles/puzzleQueries";
import { profileAliasQueryOptions } from "../../lib/users/aliasQueries";
import { registeredSiteUsernameQueryOptions } from "../../lib/users/userQueries";
import { isOneOf } from "../../utils/arrays";
import { formatLocalDateTime, formatOpponentWithRating } from "../../utils/formatters";
import { ATOMIC_OPENINGS_PATH, getOpeningTag } from "../../utils/openings";
import { normalizeUsername } from "../../utils/playerNames";
import { ProfileMatchHistory } from "./ProfileMatchHistory";
import { ProfileRankHistory } from "./ProfileRankHistory";

const countOptions = [5, 10, 20];
const profileHighlightViewStorageKey = "atomic-profile-highlight-view";

type ProfileHighlightView = "wins" | "best-ranks" | "recent-ranks";
type RankHistorySort = "rank" | "players" | "rating" | "games";
type SortDirection = "asc" | "desc";

const CommunityDiscussion = lazy(async () => {
  const module = await import("../../components/PuzzleCommunity/PuzzleCommunity");
  return { default: module.CommunityDiscussion };
});

const RatingHistoryGraph = lazy(async () => {
  const module = await import("../../features/profile/RatingHistoryGraph");
  return { default: module.RatingHistoryGraph };
});

export const PlayerProfilePage = ({
  username,
  historyOnly = false,
}: {
  username?: string;
  historyOnly?: boolean;
}) => {
  const { profileRatingSlots, showProfileActionButtons } = useAppSettings();
  const requestedUsername = useMemo(() => String(username ?? "").trim(), [username]);
  const normalizedUsername = useMemo(
    () => normalizeUsername(requestedUsername),
    [requestedUsername],
  );
  const [bestWinMode, setBestWinMode] =
    useState<import("../../constants/matches").Mode>(defaultMode);
  const [bestRankMode, setBestRankMode] =
    useState<import("../../constants/matches").Mode>(defaultMode);
  const [profileHighlightView, setProfileHighlightView] = usePersistedState<ProfileHighlightView>(
    profileHighlightViewStorageKey,
    z.enum(["wins", "best-ranks", "recent-ranks"]),
    "wins",
  );
  const [rankHistoryMode, setRankHistoryMode] = useState<RankHistoryMode>("all");
  const [rankHistorySort, setRankHistorySort] = useState<RankHistorySort | null>(null);
  const [rankHistorySortDirection, setRankHistorySortDirection] = useState<SortDirection>("asc");
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
  const [showRatingGraph, setShowRatingGraph] = useState(false);
  const profileActionsMenuRef = useRef<HTMLDetailsElement>(null);
  const profileAliasQuery = useQuery({
    ...profileAliasQueryOptions(requestedUsername),
    enabled: Boolean(requestedUsername),
  });
  const profileAliasEntry: AliasIdentityRow | null = profileAliasQuery.data ?? null;
  const aliasesLoaded = Boolean(requestedUsername) && !profileAliasQuery.isPending;
  const canonicalUsername = profileAliasEntry?.username ?? normalizedUsername;
  const profileSocialQuery = useQuery(playerSocialQueryOptions(canonicalUsername));
  const isBanned = Boolean(profileAliasEntry?.banned);
  const isBot = Boolean(profileAliasEntry?.bot);
  const isExcluded = isBanned || isBot;
  const profileLichessUsernames = useMemo(
    () => [
      canonicalUsername,
      ...(profileAliasEntry?.accounts ?? [])
        .filter((account) => account.source === "lichess")
        .map((account) => account.alias),
    ],
    [canonicalUsername, profileAliasEntry],
  );
  const puzzleDashboardCandidates = useMemo(
    () => [
      canonicalUsername,
      ...(profileAliasEntry?.accounts ?? [])
        .filter((account) => account.source === "lichess" && !account.banned && !account.bot)
        .map((account) => account.alias),
    ],
    [canonicalUsername, profileAliasEntry],
  );
  const profileTrophyUsernames = useMemo(
    () => getAliasIdentityUsernames(canonicalUsername, profileAliasEntry),
    [canonicalUsername, profileAliasEntry],
  );
  const championshipTrophiesQuery = useQuery({
    queryKey: ["profile", canonicalUsername, "tournament-trophies", profileTrophyUsernames],
    queryFn: () => fetchChampionshipTrophies(profileTrophyUsernames),
    enabled: aliasesLoaded && profileTrophyUsernames.length > 0,
    staleTime: 10 * 60 * 1_000,
  });
  const tourRankingStatsQuery = useQuery({
    ...atomicTourPlayerRankingStatsQueryOptions(profileTrophyUsernames),
    enabled: !historyOnly && aliasesLoaded && profileTrophyUsernames.length > 0,
  });
  const puzzleRankingTrophiesQuery = useQuery({
    ...puzzleRankingTrophiesQueryOptions(),
    enabled: Boolean(canonicalUsername),
  });
  const puzzleDashboardAccountQuery = useQuery({
    ...registeredSiteUsernameQueryOptions(puzzleDashboardCandidates),
    enabled: !historyOnly && Boolean(canonicalUsername),
  });
  const puzzleDashboardUsername = puzzleDashboardAccountQuery.data ?? null;
  const coinGiftAccountQuery = useQuery({
    ...registeredSiteUsernameQueryOptions(profileLichessUsernames),
    enabled: !historyOnly && Boolean(canonicalUsername),
  });
  const coinGiftRecipientUsername = coinGiftAccountQuery.data ?? null;
  const requestedProfileUsername = String(username || "").trim() || canonicalUsername;
  const profileDisplayUsername = profileAliasEntry?.accounts.some(
    (account) =>
      account.source === "pychess" && normalizeUsername(account.alias) === normalizedUsername,
  )
    ? requestedProfileUsername.toLowerCase()
    : requestedProfileUsername;
  useEffect(() => {
    if (isExcluded && (profileHistoryTab === "ranks" || profileHistoryTab === "opponents")) {
      setProfileHistoryTab("matches");
    }
  }, [isExcluded, profileHistoryTab]);

  const profileDataUsername = aliasesLoaded ? canonicalUsername : "";
  const ratingsSnapshotByMode = useRatingsSnapshotByMode(profileDataUsername);
  const ratingDisplayByMode = useMemo(
    () => getRatingDisplayByMode(ratingsSnapshotByMode, canonicalUsername),
    [ratingsSnapshotByMode, canonicalUsername],
  );
  const profileModeOptions = useMemo(
    () =>
      publicModeOptions.filter(
        (mode) =>
          (isExcluded || mode !== "wolfrandom" || ratingDisplayByMode.wolfrandom.gamesPlayed > 0) &&
          (mode !== "atomic960" || ratingDisplayByMode.atomic960.gamesPlayed > 0) &&
          (mode !== "rapid" || ratingDisplayByMode.rapid.gamesPlayed > 0),
      ),
    [
      isExcluded,
      ratingDisplayByMode.rapid.gamesPlayed,
      ratingDisplayByMode.atomic960.gamesPlayed,
      ratingDisplayByMode.wolfrandom.gamesPlayed,
    ],
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
    enabled: aliasesLoaded && !isExcluded && profileHistoryTab === "opponents",
    resetKey: normalizedUsername,
  });
  useEffect(() => {
    if (rankHistoryMode !== "all" && !profileModeOptions.includes(rankHistoryMode)) {
      setRankHistoryMode("all");
    }
    if (!profileModeOptions.includes(bestWinMode)) setBestWinMode(defaultMode);
    if (!profileModeOptions.includes(bestRankMode)) setBestRankMode(defaultMode);
  }, [bestRankMode, bestWinMode, profileModeOptions, rankHistoryMode]);
  const monthRanks = useMonthRanks(
    // Archive ranking rows are keyed by the canonical player, so every profile alias shares them.
    profileDataUsername,
    !historyOnly || profileHistoryTab === "ranks",
  );
  const visibleMonthRanks = useMemo(
    () => monthRanks.filter((rank) => profileModeOptions.includes(rank.mode)),
    [monthRanks, profileModeOptions],
  );
  const rankHistoryCountsEnabled = profileHistoryTab === "ranks" && rankHistoryView === "history";
  const rankHighlightCountsEnabled = !historyOnly && !isExcluded && profileHighlightView !== "wins";
  const monthRanksNeedingPlayerCounts = useMemo(
    () =>
      rankHistoryCountsEnabled ? monthRanks : getMonthRanksForMode(visibleMonthRanks, bestRankMode),
    [bestRankMode, monthRanks, rankHistoryCountsEnabled, visibleMonthRanks],
  );
  const monthRankPlayerCounts = useMonthRankPlayerCounts(
    monthRanksNeedingPlayerCounts,
    rankHistoryCountsEnabled || rankHighlightCountsEnabled,
  );
  const [bestMonthRankCount, setBestMonthRankCount] = useState(5);
  const [bestWinCount, setBestWinCount] = useState(5);
  useEffect(() => {
    setBestWinMode(defaultMode);
    setBestRankMode(defaultMode);
    setRankHistoryMode("all");
    setRankHistorySort(null);
    setRankHistorySortDirection("asc");
    setProfileHistoryTab(getProfileHistoryTabFromLocation());
  }, [isExcluded, normalizedUsername]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [normalizedUsername]);

  useEffect(() => {
    const closeProfileActionsMenu = (event: PointerEvent) => {
      const menu = profileActionsMenuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
        menu.removeAttribute("open");
      }
    };
    const closeProfileActionsMenuOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const menu = profileActionsMenuRef.current;
      if (!menu?.open) return;
      menu.removeAttribute("open");
      menu.querySelector("summary")?.focus();
    };

    document.addEventListener("pointerdown", closeProfileActionsMenu);
    document.addEventListener("keydown", closeProfileActionsMenuOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeProfileActionsMenu);
      document.removeEventListener("keydown", closeProfileActionsMenuOnEscape);
    };
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setProfileHistoryTab(getProfileHistoryTabFromLocation());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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

  const bestWins = useMemo(
    () => getBestWinsForMode(ratingDisplayByMode, bestWinMode, bestWinCount),
    [bestWinCount, bestWinMode, ratingDisplayByMode],
  );
  const bestRankMonthRanks = useMemo(
    () => getMonthRanksForMode(visibleMonthRanks, bestRankMode),
    [bestRankMode, visibleMonthRanks],
  );
  const rankHighlights = useMemo(
    () => getMonthRankHighlights(bestRankMonthRanks, bestMonthRankCount, bestMonthRankCount),
    [bestRankMonthRanks, bestMonthRankCount],
  );
  const bestMonthRanks = rankHighlights.bestMonthRanks;
  const recentMonthRanks = rankHighlights.recentMonthRanks;
  const displayedMonthRanks =
    profileHighlightView === "recent-ranks" ? recentMonthRanks : bestMonthRanks;
  const rankHistoryRows = useMemo(() => {
    const rows = getMonthRanksForMode(visibleMonthRanks, rankHistoryMode).map((monthRank) => ({
      ...monthRank,
      playerCount: monthRankPlayerCounts[`${monthRank.monthValue}|${monthRank.mode}`] ?? null,
    }));

    return rows.sort((a, b) => {
      if (rankHistorySort) {
        const key = rankHistorySort === "players" ? "playerCount" : rankHistorySort;
        const left = a[key];
        const right = b[key];
        const leftMissing = left === null || left === undefined;
        const rightMissing = right === null || right === undefined;
        if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
        if (!leftMissing && !rightMissing && left !== right) {
          return rankHistorySortDirection === "asc"
            ? Number(left) - Number(right)
            : Number(right) - Number(left);
        }
      }

      const dateDifference = b.monthDate.getTime() - a.monthDate.getTime();
      if (dateDifference !== 0) return dateDifference;
      return modeOptions.indexOf(a.mode) - modeOptions.indexOf(b.mode);
    });
  }, [
    monthRankPlayerCounts,
    rankHistoryMode,
    rankHistorySort,
    rankHistorySortDirection,
    visibleMonthRanks,
  ]);

  const handleRankHistorySort = (sort: RankHistorySort): void => {
    if (rankHistorySort === sort) {
      setRankHistorySortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }

    setRankHistorySort(sort);
    setRankHistorySortDirection(sort === "rank" ? "asc" : "desc");
  };
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
  const [aliasesExpanded, setAliasesExpanded] = useState(false);
  useEffect(() => {
    setAliasesExpanded(false);
  }, [canonicalUsername]);
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
  useEffect(() => {
    if (!aliasesLoaded) return;
    const defaultCount = aliasDisplayRows.length >= 8 ? 10 : 5;
    setBestWinCount(defaultCount);
    setBestMonthRankCount(defaultCount);
  }, [aliasDisplayRows.length, aliasesLoaded, canonicalUsername]);
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
  const profileMetricRows = useMemo(() => {
    const visibleRatingModes = getVisibleProfileRatingModes(
      ratingDisplayByMode,
      profileRatingSlots,
    );
    const rowsByMode = new Map(
      getProfileMetricCardRows(
        ratingDisplayByMode,
        Object.fromEntries(
          Object.entries(latestMonthKeyByMode).map(([mode, monthRank]) => [
            mode,
            monthRank?.monthKey ?? "",
          ]),
        ),
        isExcluded,
      ).map((row) => [row.key.replace(/-row$/, "") as (typeof modeOptions)[number], row]),
    );

    return visibleRatingModes.flatMap((mode) => {
      const row = rowsByMode.get(mode);
      if (!row || !profileModeOptions.includes(mode)) return [];
      if (isExcluded && !Number.isFinite(ratingDisplayByMode[mode]?.currentRating)) return [];
      return [row];
    });
  }, [
    isExcluded,
    latestMonthKeyByMode,
    profileRatingSlots,
    profileModeOptions,
    ratingDisplayByMode,
  ]);
  const rankingTrophies = useMemo(() => getRankingTrophies(monthRanks), [monthRanks]);
  const puzzleRankingTrophies = useMemo(
    () => getPuzzleRankingTrophies(puzzleRankingTrophiesQuery.data ?? [], profileTrophyUsernames),
    [profileTrophyUsernames, puzzleRankingTrophiesQuery.data],
  );
  const allRankingTrophies = useMemo(
    () => [...rankingTrophies, ...puzzleRankingTrophies],
    [puzzleRankingTrophies, rankingTrophies],
  );
  const trophyNow = new Date();
  const currentMonthKey = getCurrentMonthKey(trophyNow);
  const profileRankingMonthKey = getProfileRankingMonthKey(trophyNow);
  const publishedRankingTrophies = useMemo(
    () =>
      getPublishedProfileRankingTrophies(
        allRankingTrophies,
        currentMonthKey,
        profileRankingMonthKey,
      ),
    [allRankingTrophies, currentMonthKey, profileRankingMonthKey],
  );
  const championshipTrophies = useMemo(
    () => championshipTrophiesQuery.data ?? [],
    [championshipTrophiesQuery.data],
  );
  const profileTrophies = useMemo(
    () => sortProfileTrophies([...championshipTrophies, ...publishedRankingTrophies], "prestige"),
    [championshipTrophies, publishedRankingTrophies],
  );
  const trophyCaseTrophies = useMemo(
    () => sortProfileTrophies(profileTrophies, trophyCaseSort),
    [profileTrophies, trophyCaseSort],
  );
  const visibleProfileTrophies = useMemo(() => {
    if (isExcluded) {
      if (!puzzleRankingTrophiesQuery.isSuccess) return [];
      return getProfileHeaderTrophies({
        championshipTrophies: [],
        rankingTrophies: publishedRankingTrophies.filter((trophy) =>
          trophy.key.startsWith("puzzles-"),
        ),
        currentMonthKey: profileRankingMonthKey,
      });
    }

    return championshipTrophiesQuery.isSuccess
      ? getProfileHeaderTrophies({
          championshipTrophies,
          rankingTrophies: publishedRankingTrophies,
          currentMonthKey: profileRankingMonthKey,
        })
      : [];
  }, [
    championshipTrophies,
    championshipTrophiesQuery.isSuccess,
    isExcluded,
    profileRankingMonthKey,
    publishedRankingTrophies,
    puzzleRankingTrophiesQuery.isSuccess,
  ]);
  const hasVisibleProfileTrophies = visibleProfileTrophies.length > 0;

  const profileActionItems = (
    <>
      {!isExcluded && coinGiftRecipientUsername ? (
        <CoinProfileActions
          recipientUsername={coinGiftRecipientUsername}
          recipientAliases={profileLichessUsernames}
          displayUsername={profileDisplayUsername}
        />
      ) : null}
      <button
        type="button"
        aria-controls="profile-rating-view"
        aria-pressed={showRatingGraph}
        onClick={(event) => {
          setShowRatingGraph((current) => !current);
          event.currentTarget.closest("details")?.removeAttribute("open");
        }}
      >
        <FontAwesomeIcon icon={faChartLine} aria-hidden="true" />
        {showRatingGraph ? "Rating summary" : "Rating graph"}
      </button>
      <Link
        to="/@/$username/history"
        params={{ username: canonicalUsername }}
        search={{ tab: "comments" }}
      >
        <FontAwesomeIcon icon={faComment} aria-hidden="true" />
        Comments
        <CommunityCommentCount
          target={{ type: "profile", id: canonicalUsername }}
          className="profileActionCount"
        />
      </Link>
      {!isExcluded && puzzleDashboardUsername ? (
        <Link to="/@/$username/puzzles" params={{ username: puzzleDashboardUsername }}>
          <FontAwesomeIcon icon={faPuzzlePiece} aria-hidden="true" />
          Puzzles
        </Link>
      ) : null}
      <Link to="/@/$username/history" params={{ username: canonicalUsername }}>
        <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
        Matches
      </Link>
      <TournamentPlayerLink username={canonicalUsername}>
        <FontAwesomeIcon icon={faTrophy} aria-hidden="true" />
        Tournaments
      </TournamentPlayerLink>
    </>
  );
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
              <div className="profileIdentityHeading">
                <h1>
                  <PlayerLink className="profileHistoryTitleLink" username={canonicalUsername}>
                    {profileDisplayUsername}
                  </PlayerLink>
                  <span> Match History</span>
                </h1>
                {isBanned ? <span className="profileCheaterTag">CHEATER</span> : null}
                {isBot ? <span className="profileBotTag">BOT</span> : null}
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`profileIdentityRow${!isExcluded && hasVisibleProfileTrophies ? "" : " noTrophies"}${
              !isExcluded && visibleProfileTrophies.length >= 3 ? " compactOpenings" : ""
            }`}
          >
            <div className="profileIdentityTitle">
              <div
                className={`profileIdentityHeading${
                  !showProfileActionButtons ? " hasActionsMenu" : ""
                }`}
              >
                <h1>{profileDisplayUsername}</h1>
                {profileSocialQuery.data?.flair ? (
                  <span
                    className="profileFlair"
                    aria-label={`Flair ${profileSocialQuery.data.flair}`}
                  >
                    {profileSocialQuery.data.flair}
                  </span>
                ) : null}
                {tourRankingStatsQuery.data?.currentRank ? (
                  <Link
                    className="profileTourRankLink"
                    to="/rankings/tour"
                    hash={`${tourRankingStatsQuery.data.currentRank}`}
                    aria-label={`Atomic Chess Tour rank ${tourRankingStatsQuery.data.currentRank}`}
                    title={`Atomic Chess Tour rank #${tourRankingStatsQuery.data.currentRank}`}
                  >
                    #{tourRankingStatsQuery.data.currentRank}
                  </Link>
                ) : null}
                {isBanned ? <span className="profileCheaterTag">CHEATER</span> : null}
                {isBot ? <span className="profileBotTag">BOT</span> : null}
                {!showProfileActionButtons ? (
                  <details ref={profileActionsMenuRef} className="profileActionsMenu">
                    <summary aria-label="Profile actions" title="Profile actions">
                      <FontAwesomeIcon icon={faEllipsisVertical} aria-hidden="true" />
                    </summary>
                    <nav className="profileActionsMenuPanel" aria-label="Profile actions">
                      {profileActionItems}
                    </nav>
                  </details>
                ) : null}
              </div>
              {profileOpenings.length ? (
                <div className="profileOpeningTags" aria-label="Recognized atomic openings">
                  {profileOpenings.map((opening) => {
                    const tag = getOpeningTag(opening);
                    const label = tag?.label ?? opening.trim();
                    const tagProps = {
                      className: "profileOpeningTag",
                      "data-opening-tone": tag?.tone,
                      title: tag?.pgn,
                    };

                    return tag?.anchor ? (
                      <Link key={opening} to={ATOMIC_OPENINGS_PATH} hash={tag.anchor} {...tagProps}>
                        {label}
                      </Link>
                    ) : (
                      <span key={opening} {...tagProps}>
                        {label}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {visibleProfileTrophies.length ? (
              <div className="profileTrophyRow" aria-label="Atomic trophies">
                {visibleProfileTrophies.map((trophy) => (
                  <ProfileTrophyLink key={trophy.key} trophy={trophy} />
                ))}
              </div>
            ) : null}
          </div>
        )}

        {!historyOnly && showProfileActionButtons ? (
          <div className="profileUtilityRow">
            <nav className="profileUtilityActions" aria-label="Profile actions">
              {profileActionItems}
            </nav>
          </div>
        ) : null}

        {isBanned ? (
          <section className="profileBanNotice" aria-labelledby="profile-ban-notice-title">
            <span className="profileBanIcon" aria-hidden="true">
              <FontAwesomeIcon icon={faShieldHalved} aria-hidden="true" />
            </span>
            <div className="profileBanNoticeContent">
              <div className="profileBanNoticeHeader">
                <h2 id="profile-ban-notice-title">Banned</h2>
              </div>
              <p>
                This player was banned by Lichess or deemed highly suspicious, so we do not include
                them in rankings or normal-player statistics. Ratings shown below are estimates and
                never affect their opponents.
              </p>
              <div className="profileBanActions" aria-label="Fair play links">
                <Link to="/users/banned">Banned user list</Link>
              </div>
            </div>
          </section>
        ) : null}

        {!historyOnly && (!isExcluded || profileMetricRows.length > 0) ? (
          <div id="profile-rating-view" className="profileRatingView">
            {showRatingGraph ? (
              <Suspense fallback={<p role="status">Loading rating graph…</p>}>
                <RatingHistoryGraph key={canonicalUsername} username={canonicalUsername} />
              </Suspense>
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
          </div>
        ) : null}

        {!historyOnly ? (
          <div className="profileHighlights profileHighlightsTopRow">
            {!isExcluded ? (
              <div className="profileBestWins">
                <div className="profileBestMonthRanksHeader">
                  <h2>
                    <select
                      className="profileHighlightViewSelect"
                      aria-label="Profile highlight"
                      value={profileHighlightView}
                      onChange={(event) =>
                        setProfileHighlightView(event.target.value as ProfileHighlightView)
                      }
                    >
                      <option value="wins">Best Wins</option>
                      <option value="best-ranks">Best Ranks</option>
                      <option value="recent-ranks">Recent Ranks</option>
                    </select>
                  </h2>
                  <div className="profileHeaderControls">
                    <label htmlFor="profile-highlight-mode-select">
                      Mode
                      <select
                        id="profile-highlight-mode-select"
                        value={profileHighlightView === "wins" ? bestWinMode : bestRankMode}
                        onChange={(event) => {
                          const v = event.target.value;
                          if (isOneOf(profileModeOptions, v)) {
                            if (profileHighlightView === "wins") {
                              setBestWinMode(v);
                            } else {
                              setBestRankMode(v);
                            }
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
                    <label htmlFor="profile-highlight-count-select">
                      Show
                      <select
                        id="profile-highlight-count-select"
                        value={profileHighlightView === "wins" ? bestWinCount : bestMonthRankCount}
                        onChange={(event) => {
                          const count = Number(event.target.value);
                          if (profileHighlightView === "wins") {
                            setBestWinCount(count);
                          } else {
                            setBestMonthRankCount(count);
                          }
                        }}
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
                {profileHighlightView === "wins" ? (
                  bestWins.length === 0 ? (
                    <div className="emptyRankings">
                      No wins available in {modeLabels[bestWinMode]}.
                    </div>
                  ) : (
                    <ol>
                      {bestWins.map((win) => (
                        <li key={`best-${win.gameId}`}>
                          <span className="profileBestWinOpponent">
                            <PlayerLink className="rankingLink" username={win.opponent}>
                              {formatOpponentWithRating(win.opponent, win.opponentRating)}
                            </PlayerLink>
                          </span>
                          <span className="profileBestWinDate">
                            <LichessGameLink
                              gameId={win.gameId}
                              source={inferExternalGameSource(win.gameId)}
                              mode={bestWinMode}
                            >
                              {formatLocalDateTime(win.startTs)}
                            </LichessGameLink>
                          </span>
                        </li>
                      ))}
                    </ol>
                  )
                ) : displayedMonthRanks.length === 0 ? (
                  <div className="emptyRankings">
                    No monthly ranks available in {modeLabels[bestRankMode]}.
                  </div>
                ) : (
                  <ol>
                    {displayedMonthRanks.map((monthRank) => (
                      <li key={`${profileHighlightView}-${monthRank.mode}-${monthRank.monthKey}`}>
                        <a
                          className="rankingLink profileBestMonthRankPrimary"
                          href={buildRankingsLocation(monthRank.monthKey, monthRank.mode)}
                        >
                          {monthRank.monthLabel} {modeLabels[monthRank.mode] ?? monthRank.mode} · #
                          {`${monthRank.rank} of ${
                            monthRankPlayerCounts[
                              `${monthRank.monthValue}|${monthRank.mode}`
                            ]?.toLocaleString("en-US") ?? "…"
                          }`}
                        </a>
                        <span className="profileBestMonthRankRating">
                          {monthRank.rating ?? "—"}
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
                <div className="profileAliasesList" id="profile-aliases-list">
                  {(aliasesExpanded ? aliasDisplayRows : aliasDisplayRows.slice(0, 8)).map(
                    ({ alias, displayAlias, source, isCounted }) => {
                      const sourceLabel = getAliasProfileSourceLabel(source);
                      const externalAlias = source === "pychess" ? alias : displayAlias || alias;
                      const aliasLabel =
                        source === "pychess" ? externalAlias.toLowerCase() : externalAlias;
                      return (
                        <div key={`alias-${source}-${alias}`} className="profileAliasRow">
                          <span className="profileAliasName">
                            <span>{aliasLabel}</span>
                            {source === "lichess" && !isCounted ? (
                              <span
                                className="profileAliasStatus"
                                aria-label={NON_COUNTED_ALIAS_MESSAGE}
                                tabIndex={0}
                              >
                                <FontAwesomeIcon icon={faBeerMugEmpty} aria-hidden="true" />
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
                                : source === "pychess"
                                  ? "profileAliasPyChessLink"
                                  : "profileAliasLichessLink"
                            }`}
                            href={getAliasProfileHref(source, externalAlias)}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open ${aliasLabel} on ${sourceLabel}`}
                            title={`Open ${aliasLabel} on ${sourceLabel}`}
                          >
                            {source === "chesscom" ? (
                              <ChessComProfileIcon />
                            ) : source === "pychess" ? (
                              <PyChessProfileIcon />
                            ) : (
                              <LichessProfileIcon />
                            )}
                          </a>
                        </div>
                      );
                    },
                  )}
                </div>
              )}
              {aliasDisplayRows.length > 8 ? (
                <button
                  type="button"
                  className="profileAliasesToggle"
                  aria-expanded={aliasesExpanded}
                  aria-controls="profile-aliases-list"
                  onClick={() => setAliasesExpanded((expanded) => !expanded)}
                >
                  {aliasesExpanded ? "Show less" : "Show more"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {aliasesLoaded ? (
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
                {!isExcluded ? (
                  <>
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
                  </>
                ) : null}
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

              <ProfileMatchHistory
                profileHistoryTab={profileHistoryTab}
                profileModeOptions={profileModeOptions}
                normalizedUsername={normalizedUsername}
                canonicalUsername={canonicalUsername}
                aliasesLoaded={aliasesLoaded}
                isExcluded={isExcluded}
              />

              <ProfileRankHistory
                profileHistoryTab={profileHistoryTab}
                rankHistoryView={rankHistoryView}
                handleRankHistoryViewChange={handleRankHistoryViewChange}
                rankHistoryMode={rankHistoryMode}
                profileModeOptions={profileModeOptions}
                setRankHistoryMode={setRankHistoryMode}
                rankHistoryModeOptions={rankHistoryModeOptions}
                trophyCaseSort={trophyCaseSort}
                setTrophyCaseSort={setTrophyCaseSort}
                rankHistoryRows={rankHistoryRows}
                trophyCaseTrophies={trophyCaseTrophies}
                rankHistorySort={rankHistorySort}
                rankHistorySortDirection={rankHistorySortDirection}
                handleRankHistorySort={handleRankHistorySort}
              />

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
                    <CommunityDiscussion target={{ type: "profile", id: canonicalUsername }} />
                  </Suspense>
                ) : null}
              </section>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
