const supabaseLbConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "",
  table: import.meta.env.VITE_SUPABASE_LB_TABLE?.trim() || "lb",
};

const LB_SELECT_COLUMNS = "username,month,rank,rating,rd,games,tc";

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

export const isoMonthStartFromMonthKey = (monthKey) => {
  const monthDate = new Date(`${monthKey} 01 UTC`);
  if (Number.isNaN(monthDate.getTime())) return "";
  return monthDate.toISOString().slice(0, 10);
};

export const fetchLbRows = async ({ month, username, limit } = {}) => {
  requireSupabaseConfig();
  const { url, anonKey, table } = supabaseLbConfig;
  const baseUrl = url.replace(/\/$/, "");
  const queryParts = [`select=${encodeURIComponent(LB_SELECT_COLUMNS)}`];
  if (month) queryParts.push(`month=${encodeURIComponent(`eq.${month}`)}`);
  if (username) queryParts.push(`username=${encodeURIComponent(`eq.${username}`)}`);
  if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
    queryParts.push(`limit=${Math.floor(Number(limit))}`);
  }

  const endpoint = `${baseUrl}/rest/v1/${encodeURIComponent(table)}?${queryParts.join("&")}`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while loading Supabase table "${table}"`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error(`Expected Supabase table "${table}" to return an array`);
  }

  return rows;
};

export const hasSupabaseLbConfig = () => Boolean(supabaseLbConfig.url && supabaseLbConfig.anonKey);
