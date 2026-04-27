import { getSupabaseClient } from "./supabaseClient";
import { loadSupabaseRows } from "./supabaseRows";
import { cachedRequest } from "../../utils/requestCache";
import { normalizeUsername } from "../../utils/playerNames";

export type LbRow = {
  username: string;
  month: string;
  rank: number | null;
  rating: number | null;
  rd: number | null;
  games: number | null;
  tc: string | null;
};

export type LbFilters = {
  month?: string;
  username?: string;
  limit?: number;
};

const LB_TABLE = import.meta.env.VITE_SUPABASE_LB_TABLE?.trim() ?? "lb";
const LB_SELECT_COLUMNS = "username,month,rank,rating,rd,games,tc";
const lbRowsCache = new Map<string, Promise<LbRow[]>>();
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
  const { month, username, limit } = filters;
  const supabase = getSupabaseClient();
  const normalizedUsername = normalizeUsername(username);
  let query = supabase.from(LB_TABLE).select(LB_SELECT_COLUMNS);
  if (month) query = query.eq("month", month);
  if (normalizedUsername) query = query.eq("username", normalizedUsername);
  if (Number(limit) > 0) {
    query = query.limit(Math.floor(Number(limit)));
  }

  return loadSupabaseRows<LbRow>(LB_TABLE, query);
};

export const fetchLbRows = async (filters: LbFilters = {}): Promise<LbRow[]> =>
  cachedRequest(lbRowsCache, ["leaderboard", filters], () => fetchUncachedLbRows(filters));
