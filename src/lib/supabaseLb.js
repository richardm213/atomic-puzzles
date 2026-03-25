const supabaseLbConfig = {
  url: import.meta.env.VITE_SUPABASE_URL?.trim() || "",
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "",
  table: import.meta.env.VITE_SUPABASE_LB_TABLE?.trim() || "lb",
  playerRatingsTable:
    import.meta.env.VITE_SUPABASE_PLAYER_RATINGS_TABLE?.trim() || "player_ratings",
  blitzMatchesTable: import.meta.env.VITE_SUPABASE_BLITZ_MATCHES_TABLE?.trim() || "blitz_matches",
  bulletMatchesTable:
    import.meta.env.VITE_SUPABASE_BULLET_MATCHES_TABLE?.trim() || "bullet_matches",
};

const LB_SELECT_COLUMNS = "username,month,rank,rating,rd,games,tc";
const PLAYER_RATINGS_SELECT_COLUMNS = "username,rating,peak,rd,games,tc,rank";
const MATCHES_SELECT_COLUMNS =
  "match_id,player_1,player_2,start_ts,end_ts,time_control,source,tournament_id,game_ids,p1_before_rating,p1_after_rating,p1_before_rd,p1_after_rd,p2_before_rating,p2_after_rating,p2_before_rd,p2_after_rd";

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

export const fetchPlayerRatingsRows = async ({ tc, username, limit } = {}) => {
  requireSupabaseConfig();
  const { url, anonKey, playerRatingsTable } = supabaseLbConfig;
  const baseUrl = url.replace(/\/$/, "");
  const queryParts = [`select=${encodeURIComponent(PLAYER_RATINGS_SELECT_COLUMNS)}`];
  if (tc) queryParts.push(`tc=${encodeURIComponent(`eq.${tc}`)}`);
  if (username) queryParts.push(`username=${encodeURIComponent(`eq.${username}`)}`);
  queryParts.push("order=rank.asc");
  if (Number.isFinite(Number(limit)) && Number(limit) > 0) {
    queryParts.push(`limit=${Math.floor(Number(limit))}`);
  }

  const endpoint = `${baseUrl}/rest/v1/${encodeURIComponent(playerRatingsTable)}?${queryParts.join("&")}`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} while loading Supabase table "${playerRatingsTable}"`,
    );
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) {
    throw new Error(`Expected Supabase table "${playerRatingsTable}" to return an array`);
  }

  return rows;
};

export const hasSupabaseLbConfig = () => Boolean(supabaseLbConfig.url && supabaseLbConfig.anonKey);

export const fetchMatchRowsByMode = async ({
  mode,
  limit,
  username,
  player1,
  player2,
  startTs,
  endTs,
  timeControl,
  tournamentId,
  source,
} = {}) => {
  requireSupabaseConfig();
  const normalizedMode = String(mode || "").toLowerCase();
  const { url, anonKey, blitzMatchesTable, bulletMatchesTable } = supabaseLbConfig;
  const table =
    normalizedMode === "blitz"
      ? blitzMatchesTable
      : normalizedMode === "bullet"
        ? bulletMatchesTable
        : "";

  if (!table) {
    throw new Error(`Invalid mode "${mode}" for match loading`);
  }

  const baseUrl = url.replace(/\/$/, "");
  const queryParts = [`select=${encodeURIComponent(MATCHES_SELECT_COLUMNS)}`, "order=start_ts.desc"];
  if (username) {
    const normalizedUsername = String(username).trim();
    queryParts.push(
      `or=${encodeURIComponent(`(player_1.ilike.${normalizedUsername},player_2.ilike.${normalizedUsername})`)}`,
    );
  }
  if (player1) queryParts.push(`player_1=ilike.${encodeURIComponent(String(player1).trim())}`);
  if (player2) queryParts.push(`player_2=ilike.${encodeURIComponent(String(player2).trim())}`);
  if (timeControl) {
    queryParts.push(`time_control=ilike.${encodeURIComponent(String(timeControl).trim())}`);
  }
  if (tournamentId) {
    queryParts.push(`tournament_id=eq.${encodeURIComponent(String(tournamentId).trim())}`);
  }
  if (source) {
    queryParts.push(`source=ilike.${encodeURIComponent(String(source).trim())}`);
  }
  if (Number.isFinite(Number(startTs))) {
    queryParts.push(`start_ts=gte.${Math.floor(Number(startTs))}`);
  }
  if (Number.isFinite(Number(endTs))) {
    queryParts.push(`start_ts=lte.${Math.floor(Number(endTs))}`);
  }
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
