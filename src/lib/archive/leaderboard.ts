import { normalizeUsername } from "../../utils/playerNames";
import { cachedRequest } from "../../utils/requestCache";
import { appendArchiveParam, fetchArchiveJson } from "./client";
import type { LeaderboardPlayerCountRow, LeaderboardRow } from "./types";

type LeaderboardFilters = {
  month?: string;
  mode?: string;
  username?: string;
  limit?: number;
};

const leaderboardRowsCache = new Map<string, Promise<LeaderboardRow[]>>();
const leaderboardCountsCache = new Map<string, Promise<Record<string, number>>>();
const MONTH_INDEX_BY_NAME: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

export const monthKeyFromMonthValue = (monthValue: string | null | undefined): string => {
  if (!monthValue) return "";
  const monthDate = new Date(`${String(monthValue).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(monthDate.getTime())) return "";
  return monthDate.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const monthDateFromMonthKey = (monthKey: string | null | undefined): Date | null => {
  const [monthName, yearValue] = String(monthKey ?? "")
    .trim()
    .split(/\s+/);
  const monthIndex = monthName !== undefined ? MONTH_INDEX_BY_NAME[monthName] : undefined;
  const year = Number(yearValue);

  if (monthIndex === undefined || !Number.isInteger(year)) return null;
  return new Date(Date.UTC(year, monthIndex, 1));
};

export const isoMonthStartFromMonthKey = (monthKey: string | null | undefined): string => {
  const monthDate = monthDateFromMonthKey(monthKey);
  if (!monthDate) return "";
  return monthDate.toISOString().slice(0, 10);
};

const fetchUncachedLeaderboardRows = async (
  filters: LeaderboardFilters = {},
): Promise<LeaderboardRow[]> => {
  const { month, mode, username, limit } = filters;
  const normalizedUsername = normalizeUsername(username);
  const params = new URLSearchParams({ resource: "leaderboard" });
  appendArchiveParam(params, "month", month);
  appendArchiveParam(params, "mode", mode);
  appendArchiveParam(params, "username", normalizedUsername);
  appendArchiveParam(params, "limit", Number(limit) > 0 ? Math.floor(Number(limit)) : null);
  return fetchArchiveJson<LeaderboardRow[]>(params);
};

export const fetchLeaderboardRows = async (
  filters: LeaderboardFilters = {},
): Promise<LeaderboardRow[]> =>
  cachedRequest(leaderboardRowsCache, ["leaderboard", filters], () =>
    fetchUncachedLeaderboardRows(filters),
  );

type LeaderboardPlayerCountPair = {
  month: string;
  mode: string;
};

export const leaderboardPlayerCountKey = (month: string, mode: string): string =>
  `${month}|${mode}`;

export const parseLeaderboardPlayerCountRows = (
  rows: LeaderboardPlayerCountRow[],
): Record<string, number> =>
  Object.fromEntries(
    rows
      .map((row): [string, number] | null => {
        const month = String(row?.month_value ?? "").slice(0, 10);
        const mode = String(row?.mode ?? "")
          .trim()
          .toLowerCase();
        const count = Number(row?.player_count);
        if (!month || !mode || !Number.isFinite(count)) return null;
        return [leaderboardPlayerCountKey(month, mode), count];
      })
      .filter((entry): entry is [string, number] => entry !== null),
  );

export const fetchLeaderboardPlayerCounts = async (
  pairs: LeaderboardPlayerCountPair[],
): Promise<Record<string, number>> => {
  const normalizedPairs = [
    ...new Map(
      pairs
        .map((pair) => ({
          month: String(pair?.month ?? "").slice(0, 10),
          mode: String(pair?.mode ?? "")
            .trim()
            .toLowerCase(),
        }))
        .filter((pair) => pair.month && pair.mode)
        .map((pair) => [leaderboardPlayerCountKey(pair.month, pair.mode), pair]),
    ).values(),
  ].sort((left, right) =>
    leaderboardPlayerCountKey(left.month, left.mode).localeCompare(
      leaderboardPlayerCountKey(right.month, right.mode),
    ),
  );

  if (normalizedPairs.length === 0) return {};

  return cachedRequest(
    leaderboardCountsCache,
    ["leaderboard-counts", normalizedPairs],
    async () => {
      const rows = await fetchArchiveJson<LeaderboardPlayerCountRow[]>(
        new URLSearchParams({ resource: "leaderboard_counts" }),
      );
      const allCounts = parseLeaderboardPlayerCountRows(rows);
      return Object.fromEntries(
        normalizedPairs.map((pair) => {
          const key = leaderboardPlayerCountKey(pair.month, pair.mode);
          return [key, allCounts[key] ?? 0];
        }),
      );
    },
  );
};
