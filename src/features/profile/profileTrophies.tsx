import { Link } from "@tanstack/react-router";

import { modeLabels } from "../../constants/matches";
import { buildRankingsLocation, type MonthRank } from "../../hooks/usePlayerProfileData";
import { monthKeyFromMonthValue } from "../../lib/archive/leaderboard";
import { getSupabaseClient } from "../../lib/supabase/client";
import { loadSupabaseRows } from "../../lib/supabase/rows";
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
type TournamentProfileTrophyRow = {
  award_key?: string | null;
  label?: string | null;
  title?: string | null;
  asset_path?: string | null;
  href?: string | null;
  date_label?: string | null;
  date_value?: string | null;
  placement_label?: string | null;
  prestige?: number | string | null;
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

export const fetchChampionshipTrophies = async (username: string): Promise<ProfileTrophy[]> => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return [];

  const rows = await loadSupabaseRows<TournamentProfileTrophyRow>(
    "tournament_profile_trophies",
    getSupabaseClient()
      .from("tournament_profile_trophies")
      .select(
        "award_key,label,title,asset_path,href,date_label,date_value,placement_label,prestige",
      )
      .eq("player_name", normalizedUsername)
      .order("date_value", { ascending: false }),
  );

  return rows
    .map((row): ProfileTrophy | null => {
      const key = String(row?.award_key ?? "").trim();
      const label = String(row?.label ?? "").trim();
      const title = String(row?.title ?? "").trim();
      const assetPath = String(row?.asset_path ?? "").trim();
      const href = String(row?.href ?? "").trim();
      const dateLabel = String(row?.date_label ?? "").trim();
      const dateValue = String(row?.date_value ?? "").slice(0, 10);
      const placementLabel = String(row?.placement_label ?? "").trim();
      const prestige = Number(row?.prestige);
      if (
        !key ||
        !label ||
        !title ||
        !assetPath ||
        !href ||
        !dateLabel ||
        !dateValue ||
        !placementLabel ||
        !Number.isFinite(prestige)
      ) {
        return null;
      }

      return {
        key,
        label,
        title,
        imageSrc: appAssetPath(assetPath),
        href: appAssetPath(href),
        dateLabel,
        dateValue,
        placementLabel,
        prestige,
      };
    })
    .filter((trophy): trophy is ProfileTrophy => trophy !== null);
};

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
    const prestigeDifference = right.prestige - left.prestige;
    if (prestigeDifference !== 0) return prestigeDifference;

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

export const ProfileTrophyLink = ({ trophy }: { trophy: ProfileTrophy }) => {
  const isWolfarenaTrophy = trophy.key.startsWith("wr-arena-");
  const className = `profileTrophy${isWolfarenaTrophy ? " isWolfarena" : ""}`;
  const content = (
    <>
      <img src={trophy.imageSrc} alt="" aria-hidden="true" />
      <span className="profileTrophyLabel">{trophy.label}</span>
    </>
  );

  return isExternalHref(trophy.href) ? (
    <a
      className={className}
      title={trophy.title}
      aria-label={trophy.title}
      href={trophy.href}
      target="_blank"
      rel="noreferrer"
    >
      {content}
    </a>
  ) : (
    <Link className={className} title={trophy.title} aria-label={trophy.title} to={trophy.href}>
      {content}
    </Link>
  );
};

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
