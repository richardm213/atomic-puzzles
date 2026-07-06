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
import {
  type AliasAccount,
  type AliasAccountSource,
  type AliasIdentityRow,
  fetchProfileAliasRow,
} from "../../lib/supabase/supabaseAliases";
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
import { readStoredSourceFilters, writeStoredSourceFilters } from "../../utils/sourceFilterStorage";
import { isToggleActionKey } from "../../utils/toggleActionKey";

const countOptions = [5, 10, 20];
type RankHistoryMode = import("../../constants/matches").Mode | "all";
const profileHistoryTabOptions = ["matches", "ranks", "trophies", "opponents"] as const;
type ProfileHistoryTab = (typeof profileHistoryTabOptions)[number];
type TrophyCaseSort = "prestige" | "date";
type FavoriteOpponentSort = "matches" | "score" | "games" | "ratingGain";
const trophyCaseSortStorageKey = "atomic-puzzles:profile-trophy-case-sort";
const rankHistoryModeOptions: RankHistoryMode[] = ["all", ...modeOptions];
const favoriteOpponentModeOptions: RankHistoryMode[] = ["all", ...modeOptions];
const favoriteOpponentDefaultMatchLimit = 500;
const favoriteOpponentMatchLimitOptions = [500, 1000, 2000];
const favoriteOpponentPageSize = 200;
const favoriteOpponentDisplayCountOptions = [25, 50, 100];
const favoriteOpponentSortLabels = {
  matches: "Most matches",
  score: "Best score",
  games: "Most games",
  ratingGain: "Most rating gain",
} satisfies Record<FavoriteOpponentSort, string>;
const favoriteOpponentSortOptions = Object.keys(
  favoriteOpponentSortLabels,
) as FavoriteOpponentSort[];
const favoriteOpponentScoreConfidenceZ = 1.281551565545;

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
  gameCount: number;
  playerScore: number;
  opponentScore: number;
  ratingChange: number;
  ratedMatchCount: number;
  mostRecentTs: number;
  favoriteTimeControl: string;
  favoriteTimeControlCount: number;
  matches: FavoriteOpponentMatch[];
};

type ProfileTrophy = {
  key: string;
  label: string;
  title: string;
  imageSrc: string;
  href: string;
  dateLabel: string;
  dateValue: string;
  placementLabel: string;
  prestige: number;
};

const lichessProfileUrl = (username: string): string =>
  `https://lichess.org/@/${encodeURIComponent(String(username || "").trim())}`;

const chessComProfileUrl = (username: string): string =>
  `https://www.chess.com/member/${encodeURIComponent(String(username || "").trim())}`;

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

const isTrophyCaseSort = (value: string): value is TrophyCaseSort =>
  value === "prestige" || value === "date";

const getStoredTrophyCaseSort = (): TrophyCaseSort => {
  if (typeof window === "undefined") return "date";

  try {
    const storedSort = window.localStorage.getItem(trophyCaseSortStorageKey) ?? "";
    return isTrophyCaseSort(storedSort) ? storedSort : "date";
  } catch {
    return "date";
  }
};

const setStoredTrophyCaseSort = (sort: TrophyCaseSort): void => {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(trophyCaseSortStorageKey, sort);
  } catch {
    // Ignore storage failures; the in-memory choice still applies.
  }
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

const rankingTrophyAssets = {
  top1: appAssetPath("/images/lichess-trophies/gold-cup-2.png"),
  secondPlace: appAssetPath("/images/lichess-trophies/red-cup-2.png"),
  top10: appAssetPath("/images/lichess-trophies/silver-cup-2.png"),
};

const championshipTrophyAssets = {
  awc: appAssetPath("/images/awc-trophies/awc.png"),
  chesscomAtomic: appAssetPath("/images/awc-trophies/chesscomatomic.png"),
};

const championshipTrophiesByUsername: Record<string, ProfileTrophy[]> = {
  "fast-tsunami": [
    {
      key: "awc-2021",
      label: "AWC 2021",
      title: "Atomic World Champion 2021",
      imageSrc: championshipTrophyAssets.awc,
      href: appAssetPath("/tournaments/awc2021"),
      dateLabel: "Dec 2021",
      dateValue: "2021-12-01",
      placementLabel: "Champion",
      prestige: 1000,
    },
  ],
  natso: [
    {
      key: "awc-2024",
      label: "AWC 2024",
      title: "Atomic World Champion 2024",
      imageSrc: championshipTrophyAssets.awc,
      href: appAssetPath("/tournaments/awc2024"),
      dateLabel: "Dec 2024",
      dateValue: "2024-12-01",
      placementLabel: "Champion",
      prestige: 1000,
    },
  ],
  sutcunuri: [
    {
      key: "awc-2022",
      label: "AWC 2022",
      title: "Atomic World Champion 2022",
      imageSrc: championshipTrophyAssets.awc,
      href: appAssetPath("/tournaments/awc2022"),
      dateLabel: "Dec 2022",
      dateValue: "2022-12-01",
      placementLabel: "Champion",
      prestige: 1000,
    },
  ],
  vlad_00: [
    {
      key: "awc-2023",
      label: "AWC 2023",
      title: "Atomic World Champion 2023",
      imageSrc: championshipTrophyAssets.awc,
      href: appAssetPath("/tournaments/awc2023"),
      dateLabel: "Dec 2023",
      dateValue: "2023-12-01",
      placementLabel: "Champion",
      prestige: 1000,
    },
  ],
  jakestatefarm: [
    {
      key: "chesscom-atomic-2025",
      label: "Chess.com",
      title: "2025 Chess.com Atomic Champion",
      imageSrc: championshipTrophyAssets.chesscomAtomic,
      href: appAssetPath("/tournaments/awc2025"),
      dateLabel: "Mar 2025",
      dateValue: "2025-03-01",
      placementLabel: "Champion",
      prestige: 980,
    },
  ],
  wolfram_ep: [
    {
      key: "chesscom-atomic-2026",
      label: "Chess.com",
      title: "2026 Chess.com Atomic Champion",
      imageSrc: championshipTrophyAssets.chesscomAtomic,
      href: appAssetPath("/tournaments/ccac2026"),
      dateLabel: "Mar 2026",
      dateValue: "2026-03-01",
      placementLabel: "Champion",
      prestige: 980,
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
  counts: Map<string, { gameCount: number; latestTs: number }>,
): { favoriteTimeControl: string; favoriteTimeControlCount: number } => {
  const favorite = [...counts.entries()].sort((left, right) => {
    const countDifference = right[1].gameCount - left[1].gameCount;
    if (countDifference !== 0) return countDifference;
    return right[1].latestTs - left[1].latestTs;
  })[0];

  return {
    favoriteTimeControl: favorite?.[0] ?? "—",
    favoriteTimeControlCount: favorite?.[1].gameCount ?? 0,
  };
};

const getFavoriteOpponentRows = (matches: FavoriteOpponentMatch[]): FavoriteOpponentRow[] => {
  const rowsByOpponent = new Map<
    string,
    {
      opponent: string;
      matchCount: number;
      gameCount: number;
      playerScore: number;
      opponentScore: number;
      ratingChange: number;
      ratedMatchCount: number;
      mostRecentTs: number;
      timeControlCounts: Map<string, { gameCount: number; latestTs: number }>;
      matches: FavoriteOpponentMatch[];
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
        gameCount: 0,
        playerScore: 0,
        opponentScore: 0,
        ratingChange: 0,
        ratedMatchCount: 0,
        mostRecentTs: Number.NEGATIVE_INFINITY,
        timeControlCounts: new Map<string, { gameCount: number; latestTs: number }>(),
        matches: [],
      } satisfies {
        opponent: string;
        matchCount: number;
        gameCount: number;
        playerScore: number;
        opponentScore: number;
        ratingChange: number;
        ratedMatchCount: number;
        mostRecentTs: number;
        timeControlCounts: Map<string, { gameCount: number; latestTs: number }>;
        matches: FavoriteOpponentMatch[];
      });

    const matchGameCount =
      Number.isFinite(match.gameCount) && match.gameCount > 0
        ? match.gameCount
        : match.playerScore + match.opponentScore;

    existing.matchCount += 1;
    existing.playerScore += match.playerScore;
    existing.opponentScore += match.opponentScore;
    existing.gameCount += matchGameCount;
    if (Number.isFinite(match.ratingChange)) {
      existing.ratingChange += match.ratingChange;
      existing.ratedMatchCount += 1;
    }
    existing.mostRecentTs = Math.max(existing.mostRecentTs, match.startTs);
    existing.matches.push(match);

    const timeControl = match.timeControl || "—";
    const timeControlEntry = existing.timeControlCounts.get(timeControl) ?? {
      gameCount: 0,
      latestTs: Number.NEGATIVE_INFINITY,
    };
    timeControlEntry.gameCount += matchGameCount;
    timeControlEntry.latestTs = Math.max(timeControlEntry.latestTs, match.startTs);
    existing.timeControlCounts.set(timeControl, timeControlEntry);

    rowsByOpponent.set(opponentKey, existing);
  });

  return [...rowsByOpponent.values()]
    .map(({ timeControlCounts, ...row }) => ({
      ...row,
      matches: [...row.matches].sort((left, right) => right.startTs - left.startTs),
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

const getFavoriteOpponentBestScoreValue = (row: FavoriteOpponentRow): number => {
  if (row.gameCount <= 0) return Number.NEGATIVE_INFINITY;

  const scoreRate = row.playerScore / row.gameCount;
  const zSquared = favoriteOpponentScoreConfidenceZ * favoriteOpponentScoreConfidenceZ;
  const confidencePenalty =
    favoriteOpponentScoreConfidenceZ *
    Math.sqrt((scoreRate * (1 - scoreRate) + zSquared / (4 * row.gameCount)) / row.gameCount);

  return (
    (scoreRate + zSquared / (2 * row.gameCount) - confidencePenalty) /
    (1 + zSquared / row.gameCount)
  );
};

const compareFavoriteOpponentRows = (
  left: FavoriteOpponentRow,
  right: FavoriteOpponentRow,
  sort: FavoriteOpponentSort,
): number => {
  if (sort === "score") {
    const scoreDifference =
      getFavoriteOpponentBestScoreValue(right) - getFavoriteOpponentBestScoreValue(left);
    if (scoreDifference !== 0) return scoreDifference;
    const scoreMarginDifference =
      right.playerScore - right.opponentScore - (left.playerScore - left.opponentScore);
    if (scoreMarginDifference !== 0) return scoreMarginDifference;
  }

  if (sort === "games") {
    const gameDifference = right.gameCount - left.gameCount;
    if (gameDifference !== 0) return gameDifference;
  }

  if (sort === "ratingGain") {
    const ratedMatchDifference =
      Number(right.ratedMatchCount > 0) - Number(left.ratedMatchCount > 0);
    if (ratedMatchDifference !== 0) return ratedMatchDifference;
    const ratingDifference = right.ratingChange - left.ratingChange;
    if (ratingDifference !== 0) return ratingDifference;
  }

  const matchDifference = right.matchCount - left.matchCount;
  if (matchDifference !== 0) return matchDifference;

  if (sort !== "games") {
    const gameDifference = right.gameCount - left.gameCount;
    if (gameDifference !== 0) return gameDifference;
  }

  const recencyDifference = right.mostRecentTs - left.mostRecentTs;
  if (recencyDifference !== 0) return recencyDifference;
  return left.opponent.localeCompare(right.opponent);
};

const rankingTrophyLevels = [
  {
    maxRank: 1,
    key: "top1",
    imageSrc: rankingTrophyAssets.top1,
    suffix: "Atomic 1st place",
    placementLabel: "1st place",
    prestige: 900,
  },
  {
    maxRank: 2,
    key: "top2",
    imageSrc: rankingTrophyAssets.secondPlace,
    suffix: "Atomic 2nd place",
    placementLabel: "2nd place",
    prestige: 800,
  },
  {
    maxRank: 10,
    key: "top10",
    imageSrc: rankingTrophyAssets.top10,
    suffix: "Atomic Top 10",
    placementLabel: "Top 10",
    prestige: 700,
  },
];

const getRankingTrophies = (
  monthRanks: import("../../hooks/usePlayerProfileData").MonthRank[],
): ProfileTrophy[] =>
  monthRanks.flatMap((monthRank) => {
    const level = rankingTrophyLevels.find(({ maxRank }) => monthRank.rank <= maxRank);
    if (!level) return [];

    const modeLabel = modeLabels[monthRank.mode] ?? monthRank.mode;
    return [
      {
        key: `${monthRank.mode}-${monthRank.monthValue}-${level.key}`,
        label: modeLabel,
        title: `${modeLabel} ${level.suffix}`,
        imageSrc: level.imageSrc,
        href: buildRankingsLocation(monthRank.monthLabel, monthRank.mode),
        dateLabel: monthRank.monthLabel,
        dateValue: monthRank.monthValue,
        placementLabel: level.placementLabel,
        prestige: level.prestige,
      },
    ];
  });

const getChampionshipTrophies = (username: string): ProfileTrophy[] =>
  championshipTrophiesByUsername[normalizeUsername(username)] ?? [];

const sortProfileTrophies = (trophies: ProfileTrophy[], sort: TrophyCaseSort): ProfileTrophy[] =>
  [...trophies].sort((left, right) => {
    if (sort === "prestige") {
      const prestigeDifference = right.prestige - left.prestige;
      if (prestigeDifference !== 0) return prestigeDifference;
    }

    const dateDifference =
      new Date(`${right.dateValue}T00:00:00Z`).getTime() -
      new Date(`${left.dateValue}T00:00:00Z`).getTime();
    if (dateDifference !== 0) return dateDifference;
    return left.title.localeCompare(right.title);
  });

const getTrophyHoverLabel = (trophy: ProfileTrophy): string =>
  `${trophy.title} · ${trophy.dateLabel}`;

const ProfileTrophyLink = ({ trophy }: { trophy: ProfileTrophy }) =>
  isExternalHref(trophy.href) ? (
    <a
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
    <Link className="profileTrophy" title={trophy.title} aria-label={trophy.title} to={trophy.href}>
      <img src={trophy.imageSrc} alt="" aria-hidden="true" />
      <span className="profileTrophyLabel">{trophy.label}</span>
    </Link>
  );

const ProfileTrophyCaseCard = ({ trophy }: { trophy: ProfileTrophy }) => {
  const content = (
    <>
      <img src={trophy.imageSrc} alt="" aria-hidden="true" />
      <span className="profileTrophyCaseDetails">
        <strong>{trophy.title}</strong>
        <span>
          {trophy.placementLabel} · {trophy.dateLabel}
        </span>
      </span>
    </>
  );

  return isExternalHref(trophy.href) ? (
    <a
      className="profileTrophyCaseCard"
      title={getTrophyHoverLabel(trophy)}
      aria-label={getTrophyHoverLabel(trophy)}
      href={trophy.href}
      target="_blank"
      rel="noreferrer"
    >
      {content}
    </a>
  ) : (
    <Link
      className="profileTrophyCaseCard"
      title={getTrophyHoverLabel(trophy)}
      aria-label={getTrophyHoverLabel(trophy)}
      to={trophy.href}
    >
      {content}
    </Link>
  );
};

const LichessProfileIcon = () => (
  <svg viewBox="0 0 50 50" aria-hidden="true" focusable="false">
    <path
      d="M38.956.5c-3.53.418-6.452.902-9.286 2.984C5.534 1.786-.692 18.533.68 29.364 3.493 50.214 31.918 55.785 41.329 41.7c-7.444 7.696-19.276 8.752-28.323 3.084S-.506 27.392 4.683 17.567C9.873 7.742 18.996 4.535 29.03 6.405c2.43-1.418 5.225-3.22 7.655-3.187l-1.694 4.86 12.752 21.37c-.439 5.654-5.459 6.112-5.459 6.112-.574-1.47-1.634-2.942-4.842-6.036-3.207-3.094-17.465-10.177-15.788-16.207-2.001 6.967 10.311 14.152 14.04 17.663 3.73 3.51 5.426 6.04 5.795 6.756 0 0 9.392-2.504 7.838-8.927L37.4 7.171z"
      fill="currentColor"
    />
  </svg>
);

const ChessComProfileIcon = () => (
  <svg className="chessComProfileIcon" viewBox="-2 0 82 110" aria-hidden="true" focusable="false">
    <path
      className="chessComIconShadow"
      d="M46.3 4.6C55.1 7.4 61.5 15.7 61.5 25.7c0 6.7-2.8 12.6-7.3 16.7l10.6 8c-.4 5.5-2.1 9.7-5.2 12.6h-9.3c.9 8 5.4 14.1 13.4 19.4 7.1 4.6 10.8 10 11 16.3-5.6 2.9-17.5 4.3-35.7 4.3-18.5 0-30.5-1.4-36.1-4.3.2-6.3 3.9-11.7 11-16.3 8-5.3 12.5-11.4 13.4-19.4H18c-3.1-2.9-4.8-7.1-5.2-12.6l10.6-8c-4.5-4.1-7.3-10-7.3-16.7C16.1 13.5 26 3.7 38.2 3.7c2.8 0 5.5.3 8.1.9z"
    />
    <path
      className="chessComIconBody"
      d="M38.2 3.7c12.2 0 22.2 9.8 22.2 22 0 6.7-2.9 12.6-7.3 16.7l10.6 8c-.4 5.5-2.1 9.7-5.2 12.6h-9.3c.9 8 5.4 14.1 13.4 19.4 7.1 4.6 10.8 10 11 16.3-5.6 2.9-17.6 4.3-36 4.3S7.3 101.6 1.7 98.7c.2-6.3 3.9-11.7 11-16.3 8-5.3 12.5-11.4 13.4-19.4h-9.3c-3.1-2.9-4.8-7.1-5.2-12.6l10.6-8c-4.4-4.1-7.3-10-7.3-16.7 0-12.2 10-22 22.2-22h1.1z"
    />
    <path
      className="chessComIconFront"
      d="M35.7 5.5C24.9 6.8 16.4 16.1 16.4 27.4c0 6.1 2.4 11.4 6.3 15.4l-9.9 7.6c.5 3.7 1.7 6.4 3.7 8.2h16.2c.3 12.5-4.7 22.2-14.9 29-5.4 3.6-8.8 7.2-10.3 10.6 5.2 1.8 14.3 2.7 27.2 2.7 2.8 0 5.3 0 7.7-.1 7.7-5.1 12-13.3 12.9-24.4.7-7.6-.8-13-4.6-16.1-3.2-2.6-8.4-3.9-15.7-3.9h-5.8L34.5 40 24.4 25.4C34.9 22 40.5 15.2 41 5c-1.7-.4-3.5-.6-5.3-.6z"
    />
    <ellipse
      className="chessComIconHighlight"
      cx="33.5"
      cy="16.8"
      rx="9.2"
      ry="4.9"
      transform="rotate(-35 33.5 16.8)"
    />
  </svg>
);

const getAliasProfileHref = (source: AliasAccountSource, alias: string): string =>
  source === "chesscom" ? chessComProfileUrl(alias) : lichessProfileUrl(alias);

const getAliasProfileSourceLabel = (source: AliasAccountSource): string =>
  source === "chesscom" ? "Chess.com" : "Lichess";

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
  queryFilters.sourceFilters = filters.sourceFilters;
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
  sourceFilters: readStoredSourceFilters(),
  timeControlInitialFilter: "all",
  timeControlIncrementFilter: "all",
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
  const [trophyCaseSort, setTrophyCaseSort] = useState<TrophyCaseSort>(getStoredTrophyCaseSort);
  const [profileHistoryTab, setProfileHistoryTab] = useState<ProfileHistoryTab>(() =>
    getProfileHistoryTabFromLocation(),
  );
  const [profileAliasEntry, setProfileAliasEntry] = useState<AliasIdentityRow | null>(null);
  const [aliasesLoaded, setAliasesLoaded] = useState(false);
  const [matchesByMode, setMatchesByMode] = useState(() => createModeRecord(() => []));
  const [totalMatchesByMode, setTotalMatchesByMode] = useState(() => createModeRecord(() => 0));
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedMatchKeys, setExpandedMatchKeys] = useState<string[]>([]);
  const [expandedFavoriteOpponentKeys, setExpandedFavoriteOpponentKeys] = useState<string[]>([]);
  const [opponentRatingMin, setOpponentRatingMin] = useState(defaultRatingMin);
  const [opponentRatingMax, setOpponentRatingMax] = useState(defaultRatingMax);
  const [opponentFilter, setOpponentFilter] = useState("");
  const [startDateFilter, setStartDateFilter] = useState("");
  const [endDateFilter, setEndDateFilter] = useState("");
  const [sourceFilters, setSourceFilters] = useState(readStoredSourceFilters);
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
  const [favoriteOpponentSort, setFavoriteOpponentSort] = useState<FavoriteOpponentSort>("matches");
  const [favoriteOpponentLoadKey, setFavoriteOpponentLoadKey] = useState("");
  const [loadingFavoriteOpponents, setLoadingFavoriteOpponents] = useState(false);
  const [favoriteOpponentsError, setFavoriteOpponentsError] = useState("");
  const matchRequestIdRef = useRef(0);
  const favoriteOpponentsRequestIdRef = useRef(0);
  const searchSubmitInFlightRef = useRef(false);
  const canonicalUsername = profileAliasEntry?.username ?? normalizedUsername;
  const profileDisplayUsername = String(username || "").trim() || canonicalUsername;
  const favoriteOpponentQueryKey = `${canonicalUsername}|${favoriteOpponentMode}|${favoriteOpponentMatchLimit}`;
  const isBanned = Boolean(profileAliasEntry?.banned);
  const profileDataUsername = aliasesLoaded ? canonicalUsername : "";
  const ratingsSnapshotByMode = useRatingsSnapshotByMode(profileDataUsername);
  const monthRanks = useMonthRanks(profileDataUsername);
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
    setExpandedFavoriteOpponentKeys([]);
    setMatchesByMode(createModeRecord(() => []));
    setTotalMatchesByMode(createModeRecord(() => 0));
    setFavoriteOpponentRows([]);
    setFavoriteOpponentMode("all");
    setFavoriteOpponentMatchLimit(favoriteOpponentDefaultMatchLimit);
    setFavoriteOpponentDisplayCount(25);
    setFavoriteOpponentSort("matches");
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
      setExpandedFavoriteOpponentKeys([]);
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
    () =>
      [...favoriteOpponentRows]
        .sort((left, right) => compareFavoriteOpponentRows(left, right, favoriteOpponentSort))
        .slice(0, favoriteOpponentDisplayCount),
    [favoriteOpponentDisplayCount, favoriteOpponentRows, favoriteOpponentSort],
  );
  const favoriteOpponentScopeLabel =
    favoriteOpponentMode === "all"
      ? "matches overall"
      : `${modeLabels[favoriteOpponentMode] ?? favoriteOpponentMode} matches`;
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
  const rankingTrophies = useMemo(
    () => getRankingTrophies(monthRanks),
    [monthRanks],
  );
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
  const toggleFavoriteOpponentKey = (key: string): void => {
    setExpandedFavoriteOpponentKeys((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  };

  return (
    <div className="rankingsPage">
      <Seo
        title={
          historyOnly
            ? `${canonicalUsername} Atomic Chess History`
            : `${canonicalUsername} Atomic Chess Profile`
        }
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
              <i className="fa-solid fa-shield-halved" />
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
                  id="profile-trophy-case-tab"
                  type="button"
                  role="tab"
                  aria-selected={profileHistoryTab === "trophies"}
                  aria-controls="profile-trophy-case-panel"
                  className={profileHistoryTab === "trophies" ? "active" : ""}
                  onClick={() => handleProfileHistoryTabChange("trophies")}
                >
                  Trophy Case
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
                id="profile-trophy-case-panel"
                className="profileHistorySection"
                role="tabpanel"
                aria-labelledby="profile-trophy-case-tab"
                hidden={profileHistoryTab !== "trophies"}
              >
                <div className="rankingsMeta profileHistoryMeta">
                  <div className="profileHistoryTitleControl">
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
                            setStoredTrophyCaseSort(nextSort);
                          }
                        }}
                      >
                        <option value="prestige">Prestige</option>
                        <option value="date">Date</option>
                      </select>
                    </label>
                  </div>
                  <span>{trophyCaseTrophies.length} trophies</span>
                </div>

                {trophyCaseTrophies.length ? (
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
                    <label htmlFor="profile-favorite-opponents-sort-select">
                      <span>Sort</span>
                      <select
                        id="profile-favorite-opponents-sort-select"
                        aria-label="Favorite opponents sort"
                        value={favoriteOpponentSort}
                        onChange={(event) => {
                          const v = event.target.value;
                          if ((favoriteOpponentSortOptions as readonly string[]).includes(v)) {
                            setFavoriteOpponentSort(v as FavoriteOpponentSort);
                          }
                        }}
                      >
                        {favoriteOpponentSortOptions.map((sort) => (
                          <option key={sort} value={sort}>
                            {favoriteOpponentSortLabels[sort]}
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
                        <th>Games</th>
                        <th>H2H Score</th>
                        <th>Rating Δ</th>
                        <th>Most Recent</th>
                        <th>Most Played TC</th>
                        <th aria-label="Open H2H page" />
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFavoriteOpponentRows.map((row) => {
                        const opponentKey = normalizeUsername(row.opponent);
                        const isExpanded = expandedFavoriteOpponentKeys.includes(opponentKey);

                        return (
                          <Fragment key={`favorite-opponent-${opponentKey}`}>
                            <tr
                              className={`expandableMatchRow profileFavoriteOpponentRow${
                                isExpanded ? " expanded" : ""
                              }`}
                              onClick={() => toggleFavoriteOpponentKey(opponentKey)}
                              onKeyDown={(event) => {
                                if (!isToggleActionKey(event)) return;
                                event.preventDefault();
                                toggleFavoriteOpponentKey(opponentKey);
                              }}
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
                              <td>{row.matchCount.toLocaleString("en-US")}</td>
                              <td>{row.gameCount.toLocaleString("en-US")}</td>
                              <td>
                                {formatScore(row.playerScore)} - {formatScore(row.opponentScore)}
                              </td>
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
                                {row.favoriteTimeControlCount > 0
                                  ? ` (${row.favoriteTimeControlCount})`
                                  : ""}
                              </td>
                              <td>
                                <Link
                                  className="matchPageLink"
                                  to="/h2h/$matchup"
                                  params={{
                                    matchup: matchupToSlug(canonicalUsername, row.opponent),
                                  }}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={`Open H2H: ${canonicalUsername} vs ${row.opponent}`}
                                  aria-label={`Open H2H: ${canonicalUsername} vs ${row.opponent}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <FontAwesomeIcon icon={faUpRightFromSquare} />
                                </Link>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr className="favoriteOpponentMatchesRow">
                                <td colSpan={8}>
                                  <div className="favoriteOpponentMatchesInner">
                                    <table className="favoriteOpponentMatchesTable">
                                      <thead>
                                        <tr>
                                          <th>Date / Time</th>
                                          <th>Game ID</th>
                                          <th>Mode</th>
                                          <th>TC</th>
                                          <th>Score</th>
                                          <th>Rating Δ</th>
                                          <th>Games</th>
                                          <th aria-label="Open match page" />
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row.matches.map((match) => {
                                          const favoriteMatchKey = `${opponentKey}-${match.startTs}-${match.firstGameId}-${match.matchId}`;

                                          return (
                                            <tr key={favoriteMatchKey}>
                                              <td>{formatLocalDateTime(match.startTs)}</td>
                                              <td>
                                                <LichessGameLink
                                                  gameId={match.firstGameId}
                                                  source={match.sourceValue}
                                                  onClick={(event) => event.stopPropagation()}
                                                >
                                                  {match.firstGameId}
                                                </LichessGameLink>
                                              </td>
                                              <td>{modeLabels[match.mode] ?? match.mode}</td>
                                              <td>
                                                <span className="profileTablePill">
                                                  {match.timeControl}
                                                </span>
                                              </td>
                                              <td>{`${formatScore(match.playerScore)} - ${formatScore(
                                                match.opponentScore,
                                              )}`}</td>
                                              <td>
                                                {Number.isFinite(match.ratingChange) ? (
                                                  <span className="profileDelta">
                                                    {formatSignedDecimal(match.ratingChange)}
                                                  </span>
                                                ) : (
                                                  "—"
                                                )}
                                              </td>
                                              <td>{match.gameCount.toLocaleString("en-US")}</td>
                                              <td>
                                                <MatchPageLink
                                                  match={{
                                                    ...match,
                                                    playerA: canonicalUsername,
                                                    playerB: row.opponent,
                                                    mode: match.mode,
                                                  }}
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
                      {loadingFavoriteOpponents ? (
                        <tr>
                          <td colSpan={8} className="emptyRankings">
                            {`Loading favorite opponents from the last ${favoriteOpponentMatchLimit.toLocaleString("en-US")} ${favoriteOpponentScopeLabel}...`}
                          </td>
                        </tr>
                      ) : null}
                      {!loadingFavoriteOpponents && favoriteOpponentRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="emptyRankings">
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
