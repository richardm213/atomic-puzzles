import { Link } from "@tanstack/react-router";

import { modeLabels } from "../../constants/matches";
import { buildRankingsLocation, type MonthRank } from "../../hooks/usePlayerProfileData";
import { monthKeyFromMonthValue } from "../../lib/supabase/supabaseLb";
import { appAssetPath } from "../../utils/appAssetPath";
import { normalizeUsername } from "../../utils/playerNames";

export type TrophyCaseSort = "prestige" | "date";

export type ProfileTrophy = {
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

export const trophyCaseSortStorageKey = "atomic-puzzles:profile-trophy-case-sort";
const rankingTrophyAssets = {
  top1: appAssetPath("/images/lichess-trophies/gold-cup-2.png"),
  secondPlace: appAssetPath("/images/lichess-trophies/red-cup-2.png"),
  top10: appAssetPath("/images/lichess-trophies/silver-cup-2.png"),
};
const championshipTrophyAssets = {
  atomicOpenings: appAssetPath("/images/awc-trophies/atomic-openings-championship.png"),
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
      key: "atomic-openings-2026",
      label: "AOC 2026",
      title: "2026 Atomic Openings Champion",
      imageSrc: championshipTrophyAssets.atomicOpenings,
      href: appAssetPath("/tournaments/aoc2026"),
      dateLabel: "Jul 2026",
      dateValue: "2026-07-31",
      placementLabel: "Champion",
      prestige: 970,
    },
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

export const isTrophyCaseSort = (value: string): value is TrophyCaseSort =>
  value === "prestige" || value === "date";

export const getCurrentMonthKey = (): string =>
  monthKeyFromMonthValue(new Date().toISOString().slice(0, 10));

export const getRankingTrophies = (monthRanks: MonthRank[]): ProfileTrophy[] =>
  monthRanks.flatMap((monthRank) => {
    if (monthRank.mode === "wolfrandom") return [];
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

export const getChampionshipTrophies = (username: string): ProfileTrophy[] =>
  championshipTrophiesByUsername[normalizeUsername(username)] ?? [];

export const sortProfileTrophies = (
  trophies: ProfileTrophy[],
  sort: TrophyCaseSort,
): ProfileTrophy[] =>
  [...trophies].sort((left, right) => {
    if (sort === "prestige") {
      const prestigeDifference = right.prestige - left.prestige;
      if (prestigeDifference !== 0) return prestigeDifference;
    }
    const dateDifference =
      new Date(`${right.dateValue}T00:00:00Z`).getTime() -
      new Date(`${left.dateValue}T00:00:00Z`).getTime();
    return dateDifference !== 0 ? dateDifference : left.title.localeCompare(right.title);
  });

const sortChampionshipTrophiesForHeader = (trophies: ProfileTrophy[]): ProfileTrophy[] =>
  [...trophies].sort((left, right) => {
    const leftIsAwc = left.key.startsWith("awc-");
    const rightIsAwc = right.key.startsWith("awc-");
    if (leftIsAwc !== rightIsAwc) return leftIsAwc ? -1 : 1;

    const dateDifference =
      new Date(`${right.dateValue}T00:00:00Z`).getTime() -
      new Date(`${left.dateValue}T00:00:00Z`).getTime();
    return dateDifference !== 0 ? dateDifference : left.title.localeCompare(right.title);
  });

export const getProfileHeaderTrophies = ({
  championshipTrophies,
  rankingTrophies,
  currentMonthKey,
  limit = 3,
}: {
  championshipTrophies: ProfileTrophy[];
  rankingTrophies: ProfileTrophy[];
  currentMonthKey: string;
  limit?: number;
}): ProfileTrophy[] => {
  const currentRankingTrophies = rankingTrophies.filter(
    (trophy) => trophy.dateLabel === currentMonthKey,
  );
  const orderedChampionshipTrophies = sortChampionshipTrophiesForHeader(championshipTrophies);

  if (!currentRankingTrophies.length) {
    return orderedChampionshipTrophies.slice(0, limit);
  }

  const primaryChampionship = orderedChampionshipTrophies.slice(0, 1);
  return sortProfileTrophies([...primaryChampionship, ...currentRankingTrophies], "prestige").slice(
    0,
    limit,
  );
};

const isExternalHref = (href: string): boolean => /^https?:\/\//i.test(String(href || "").trim());
const getTrophyHoverLabel = (trophy: ProfileTrophy): string =>
  `${trophy.title} · ${trophy.dateLabel}`;

export const ProfileTrophyLink = ({ trophy }: { trophy: ProfileTrophy }) =>
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

export const ProfileTrophyCaseCard = ({ trophy }: { trophy: ProfileTrophy }) => {
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
  const label = getTrophyHoverLabel(trophy);
  return isExternalHref(trophy.href) ? (
    <a
      className="profileTrophyCaseCard"
      title={label}
      aria-label={label}
      href={trophy.href}
      target="_blank"
      rel="noreferrer"
    >
      {content}
    </a>
  ) : (
    <Link className="profileTrophyCaseCard" title={label} aria-label={label} to={trophy.href}>
      {content}
    </Link>
  );
};
