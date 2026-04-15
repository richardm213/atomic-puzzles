import { getSupabaseClient } from "./supabaseClient";

const supabaseLbConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "",
  table: import.meta.env.VITE_SUPABASE_LB_TABLE?.trim() || "lb",
};

const LB_SELECT_COLUMNS = "username,month,rank,rating,rd,games,tc";
const MONTH_INDEX_BY_NAME = {
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

const requireSupabaseConfig = () => {
  const { url, anonKey } = supabaseLbConfig;
  if (!url || !anonKey) {
    throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
  }
};

export const monthKeyFromMonthValue = (monthValue) => {
  if (!monthValue) return "";
  const monthDate = new Date(`${String(monthValue).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(monthDate.getTime())) return "";
  return monthDate.toLocaleString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const monthDateFromMonthKey = (monthKey) => {
  const [monthName, yearValue] = String(monthKey || "").trim().split(/\s+/);
  const monthIndex = MONTH_INDEX_BY_NAME[monthName];
  const year = Number(yearValue);

  if (monthIndex === undefined || !Number.isInteger(year)) return null;
  return new Date(Date.UTC(year, monthIndex, 1));
};

export const isoMonthStartFromMonthKey = (monthKey) => {
  const monthDate = monthDateFromMonthKey(monthKey);
  if (!monthDate) return "";
  return monthDate.toISOString().slice(0, 10);
};

export const fetchLbRows = async ({ month, username, limit } = {}) => {
  requireSupabaseConfig();
  const { table } = supabaseLbConfig;
  const supabase = getSupabaseClient();
  let query = supabase.from(table).select(LB_SELECT_COLUMNS);
  if (month) query = query.eq("month", month);
  if (username) query = query.eq("username", username);
  if (Number(limit) > 0) {
    query = query.limit(Math.floor(Number(limit)));
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed loading Supabase table "${table}": ${error.message}`);
  }
  const rows = data;
  if (!Array.isArray(rows)) {
    throw new Error(`Expected Supabase table "${table}" to return an array`);
  }

  return rows;
};
