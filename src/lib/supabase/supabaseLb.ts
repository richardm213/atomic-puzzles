import type { LbPlayerCountRow, LbRow } from "../../types/supabase";
import { normalizeUsername } from "../../utils/playerNames";
import { cachedRequest } from "../../utils/requestCache";
import { getSupabaseClient } from "./supabaseClient";
import { loadSupabasePage, loadSupabaseRows } from "./supabaseRows";

export type { LbRow } from "../../types/supabase";

export type LbFilters = {
  month?: string;
  mode?: string;
  username?: string;
  limit?: number;
};

const LB_TABLE = import.meta.env.VITE_SUPABASE_LB_TABLE?.trim() ?? "lb";
const LB_SELECT_COLUMNS = "username,month,rank,rating,rd,games,tc";
const lbRowsCache = new Map<string, Promise<LbRow[]>>();
const lbCountCache = new Map<string, Promise<number>>();
const lbCountsCache = new Map<string, Promise<Record<string, number>>>();
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

const fetchUncachedLbRows = async (filters: LbFilters = {}): Promise<LbRow[]> => {
  const { month, mode, username, limit } = filters;
  const supabase = getSupabaseClient();
  const normalizedUsername = normalizeUsername(username);
  let query = supabase.from(LB_TABLE).select(LB_SELECT_COLUMNS);
  if (month) query = query.eq("month", month);
  if (mode) query = query.eq("tc", mode);
  if (normalizedUsername) query = query.eq("username", normalizedUsername);
  if (Number(limit) > 0) {
    query = query.limit(Math.floor(Number(limit)));
  }

  return loadSupabaseRows<LbRow>(LB_TABLE, query);
};

export const fetchLbRows = async (filters: LbFilters = {}): Promise<LbRow[]> =>
  cachedRequest(lbRowsCache, ["leaderboard", filters], () => fetchUncachedLbRows(filters));

const fetchUncachedLbPlayerCount = async (month: string, mode: string): Promise<number> => {
  const supabase = getSupabaseClient();
  const query = supabase
    .from(LB_TABLE)
    .select("username", { count: "exact", head: true })
    .eq("month", month)
    .eq("tc", mode);

  const { count } = await loadSupabasePage<LbRow>(LB_TABLE, query);
  return Number(count) || 0;
};

export const fetchLbPlayerCount = async (month: string, mode: string): Promise<number> =>
  cachedRequest(lbCountCache, ["leaderboard-count", month, mode], () =>
    fetchUncachedLbPlayerCount(month, mode),
  );

export type LbPlayerCountPair = {
  month: string;
  mode: string;
};

export const lbPlayerCountKey = (month: string, mode: string): string => `${month}|${mode}`;

export const parseLbPlayerCountRows = (rows: LbPlayerCountRow[]): Record<string, number> =>
  Object.fromEntries(
    rows
      .map((row): [string, number] | null => {
        const month = String(row?.month_value ?? "").slice(0, 10);
        const mode = String(row?.mode ?? "")
          .trim()
          .toLowerCase();
        const count = Number(row?.player_count);
        if (!month || !mode || !Number.isFinite(count)) return null;
        return [lbPlayerCountKey(month, mode), count];
      })
      .filter((entry): entry is [string, number] => entry !== null),
  );

export const fetchLbPlayerCounts = async (
  pairs: LbPlayerCountPair[],
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
        .map((pair) => [lbPlayerCountKey(pair.month, pair.mode), pair]),
    ).values(),
  ].sort((left, right) =>
    lbPlayerCountKey(left.month, left.mode).localeCompare(
      lbPlayerCountKey(right.month, right.mode),
    ),
  );

  if (normalizedPairs.length === 0) return {};

  return cachedRequest(lbCountsCache, ["leaderboard-counts", normalizedPairs], async () => {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("get_lb_player_counts", {
      p_pairs: normalizedPairs,
    });
    if (error) throw new Error(`Failed loading leaderboard player counts: ${error.message}`);
    return parseLbPlayerCountRows(Array.isArray(data) ? data : []);
  });
};
