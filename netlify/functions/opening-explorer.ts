import { createHash } from "node:crypto";

import { createClient } from "@libsql/client/web";

type NetlifyEvent = {
  httpMethod?: string;
  path?: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined> | null;
};

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const MAX_CACHE_ENTRIES = 500;
const MAX_FEN_LENGTH = 120;
const MAX_USERNAME_LENGTH = 40;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 90;
const ALLOWED_QUERY_PARAMS = new Set([
  "fen",
  "color",
  "minRating",
  "speeds",
  "startDate",
  "endDate",
  "username",
  "opponent",
]);
const cache = new Map<string, string>();
const aliasCache = new Map<string, Map<string, string>>();
const rateLimits = new Map<string, { count: number; resetAt: number }>();

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

const positionKeyHex = (fen: string): string =>
  createHash("sha1").update(`atomic|${fen}`).digest("hex").slice(0, 32);

const getHeader = (event: NetlifyEvent, name: string): string => {
  const headers = event.headers ?? {};
  const lowerName = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName && value) return value;
  }

  return "";
};

const getClientIp = (event: NetlifyEvent): string => {
  const netlifyIp = getHeader(event, "x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp;

  const forwardedFor = getHeader(event, "x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";

  return getHeader(event, "client-ip") || "unknown";
};

const isSameOriginRequest = (event: NetlifyEvent): boolean => {
  const secFetchSite = getHeader(event, "sec-fetch-site").toLowerCase();
  if (secFetchSite === "cross-site") return false;

  const origin = getHeader(event, "origin");
  if (!origin) return true;

  const host = getHeader(event, "host");
  if (!host) return true;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
};

const checkRateLimit = (
  clientIp: string,
  now: number = Date.now(),
): { allowed: true } | { allowed: false; retryAfterSeconds: number } => {
  const current = rateLimits.get(clientIp);

  if (!current || current.resetAt <= now) {
    rateLimits.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return { allowed: true };
};

const sqlMonthBounds = (value: string): { start: number; end: number } | null => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: year * 10000 + month * 100 + 1,
    end: year * 10000 + month * 100 + lastDay,
  };
};

const jsonResponse = (statusCode: number, body: JsonValue) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": statusCode === 200 ? "public, max-age=30" : "no-store",
  },
  body: JSON.stringify(body),
});

const rateLimitResponse = (retryAfterSeconds: number) => ({
  statusCode: 429,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Retry-After": String(retryAfterSeconds),
  },
  body: JSON.stringify({ error: "Too many opening explorer requests. Please wait and try again." }),
});

const getQueryParams = (event: NetlifyEvent): URLSearchParams => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(event.queryStringParameters ?? {})) {
    if (typeof value === "string") params.set(key, value);
  }

  return params;
};

const validateQueryParams = (params: URLSearchParams): string | null => {
  for (const key of params.keys()) {
    if (!ALLOWED_QUERY_PARAMS.has(key)) return `Unexpected query parameter: ${key}`;
  }

  return null;
};

const isValidFen = (fen: string): boolean => {
  if (fen.length > MAX_FEN_LENGTH || !/^[0-9a-hwbkqnrpBKQNRP/\-. ]+$/.test(fen)) {
    return false;
  }

  const fields = fen.split(/\s+/);
  if (fields.length !== 6) return false;

  const [board, activeColor, castling, enPassant, halfmoveClock, fullmoveNumber] = fields;
  if (!board || !activeColor || !castling || !enPassant || !halfmoveClock || !fullmoveNumber) {
    return false;
  }

  if (activeColor !== "w" && activeColor !== "b") return false;
  if (!/^(?:-|[KQkq]{1,4})$/.test(castling)) return false;
  if (!/^(?:-|[a-h][36])$/.test(enPassant)) return false;
  if (!/^\d{1,3}$/.test(halfmoveClock) || !/^\d{1,4}$/.test(fullmoveNumber)) return false;

  const ranks = board.split("/");
  if (ranks.length !== 8) return false;

  return ranks.every((rank) => {
    let fileCount = 0;

    for (const char of rank) {
      if (/^[1-8]$/.test(char)) {
        fileCount += Number(char);
      } else if (/^[bkqnrpBKQNRP]$/.test(char)) {
        fileCount += 1;
      } else {
        return false;
      }
    }

    return fileCount === 8;
  });
};

const parseUsername = (value: string | null): string | null => {
  const username = value?.trim().toLowerCase() ?? "";
  if (!username) return "";
  if (username.length > MAX_USERNAME_LENGTH || !/^[a-z0-9_-]+$/.test(username)) return null;
  return username;
};

const parseColor = (value: string | null): 0 | 1 | null => {
  if (!value || value === "white") return 0;
  if (value === "black") return 1;
  return null;
};

const parseMinRating = (value: string | null): number | null => {
  if (!value) return 1700;
  if (!/^\d{3,4}$/.test(value)) return null;

  const rating = Number.parseInt(value, 10);
  if (!Number.isFinite(rating)) return null;
  return Math.max(1700, Math.min(2200, rating));
};

const parseSpeeds = (value: string | null): number[] | null => {
  if (!value) return [0, 1];
  if (!/^[01](?:,[01])?$/.test(value)) return null;

  return [...new Set(value.split(",").map((speed) => Number.parseInt(speed, 10)))].sort();
};

const normalizeValue = (value: unknown): JsonValue => {
  if (typeof value === "bigint") return Number(value);
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
};

const normalizeRows = (rows: Iterable<Record<string, unknown>>): Record<string, JsonValue>[] =>
  Array.from(rows, (row) =>
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)])),
  );

const getClient = () => {
  const url = process.env.TURSO_DATABASE_URL?.trim();
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim();

  if (!url || !authToken) {
    throw new Error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN");
  }

  return createClient({ url, authToken });
};

const remember = (key: string, body: string): void => {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }

  cache.set(key, body);
};

const resolveCanonicalUsername = async (username: string, databaseUrl: string): Promise<string> => {
  if (!username) return "";

  const cachedAliases = aliasCache.get(databaseUrl);
  if (cachedAliases) {
    return cachedAliases.get(username) ?? username;
  }

  const aliases = new Map<string, string>();

  try {
    const client = getClient();
    const result = await client.execute(
      "select value from opening_index_meta where key = 'aliases' limit 1;",
    );
    const rows = normalizeRows(result.rows);
    const rawValue = rows[0]?.value;
    const rawAliases = typeof rawValue === "string" ? JSON.parse(rawValue) : {};

    if (rawAliases && typeof rawAliases === "object" && !Array.isArray(rawAliases)) {
      for (const [alias, canonical] of Object.entries(rawAliases)) {
        const aliasKey = String(alias).trim().toLowerCase();
        const canonicalValue = String(canonical).trim().toLowerCase();
        if (aliasKey && canonicalValue) aliases.set(aliasKey, canonicalValue);
      }
    }
  } catch {
    // Older databases do not include alias metadata.
  }

  aliasCache.set(databaseUrl, aliases);
  return aliases.get(username) ?? username;
};

export const handler = async (event: NetlifyEvent) => {
  const databaseUrl = process.env.TURSO_DATABASE_URL?.trim() ?? "";
  const method = event.httpMethod ?? "GET";

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-store",
      },
      body: "",
    };
  }

  if (method !== "GET") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  if (!isSameOriginRequest(event)) {
    return jsonResponse(403, { error: "Opening explorer requests must come from this site" });
  }

  if (event.path?.endsWith("/health")) {
    return jsonResponse(200, {
      ok: true,
      configured: Boolean(databaseUrl && process.env.TURSO_AUTH_TOKEN?.trim()),
      schema: "compact",
      source: "turso",
    });
  }

  const params = getQueryParams(event);
  const queryError = validateQueryParams(params);
  if (queryError) {
    return jsonResponse(400, { error: queryError });
  }

  const rateLimit = checkRateLimit(getClientIp(event));
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.retryAfterSeconds);
  }

  const fen = params.get("fen")?.trim();

  if (!fen) {
    return jsonResponse(400, { error: "Missing fen query parameter" });
  }

  if (!isValidFen(fen)) {
    return jsonResponse(400, { error: "Invalid fen query parameter" });
  }

  if (!databaseUrl || !process.env.TURSO_AUTH_TOKEN?.trim()) {
    return jsonResponse(503, { error: "Opening explorer Turso credentials are not configured" });
  }

  const requestedUsername = parseUsername(params.get("username"));
  if (requestedUsername === null) {
    return jsonResponse(400, { error: "Invalid username query parameter" });
  }

  const username = await resolveCanonicalUsername(requestedUsername, databaseUrl);
  const requestedOpponent = parseUsername(params.get("opponent"));
  if (requestedOpponent === null) {
    return jsonResponse(400, { error: "Invalid opponent query parameter" });
  }
  const opponent = username
    ? await resolveCanonicalUsername(requestedOpponent, databaseUrl)
    : "";
  const color = parseColor(params.get("color"));
  if (color === null) {
    return jsonResponse(400, { error: "Invalid color query parameter" });
  }

  const minRating = parseMinRating(params.get("minRating"));
  if (minRating === null) {
    return jsonResponse(400, { error: "Invalid minRating query parameter" });
  }

  const startDate = sqlMonthBounds(params.get("startDate")?.trim() ?? "")?.start ?? null;
  const endDate = sqlMonthBounds(params.get("endDate")?.trim() ?? "")?.end ?? null;
  if (
    (params.has("startDate") && startDate === null) ||
    (params.has("endDate") && endDate === null)
  ) {
    return jsonResponse(400, { error: "Invalid month filter query parameter" });
  }

  const speeds = parseSpeeds(params.get("speeds"));
  if (speeds === null) {
    return jsonResponse(400, { error: "Invalid speeds query parameter" });
  }

  const keyHex = positionKeyHex(fen);
  const cacheKey = JSON.stringify({
    source: "turso",
    databaseUrl,
    fen,
    color,
    requestedUsername,
    username,
    requestedOpponent,
    opponent,
    minRating,
    speeds,
    startDate,
    endDate,
  });
  const cached = cache.get(cacheKey);
  if (cached) {
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
      },
      body: cached,
    };
  }

  const playerIdSql = username
    ? `(select name_id from opening_names where lower(name) = ${sqlString(username)} limit 1)`
    : "";
  const opponentIdSql = opponent
    ? `(select name_id from opening_names where lower(name) = ${sqlString(opponent)} limit 1)`
    : "";
  const opponentIdColumn = color === 0 ? "black_id" : "white_id";
  const edgesPlayerSql = username ? `and canonical_player_id = ${playerIdSql}` : "";
  const gamesPlayerSql = username ? `and g.canonical_player_id = ${playerIdSql}` : "";
  const gamesOpponentSql = opponent ? `and g.${opponentIdColumn} = ${opponentIdSql}` : "";
  const edgesColorSql = `and player_color = ${color}`;
  const gamesColorSql = `and g.player_color = ${color}`;
  const speedSql = speeds.join(",");
  const edgesDateSql = `
    ${startDate ? `and played_on >= ${startDate}` : ""}
    ${endDate ? `and played_on <= ${endDate}` : ""}
  `;
  const gamesDateSql = `
    ${startDate ? `and g.played_on >= ${startDate}` : ""}
    ${endDate ? `and g.played_on <= ${endDate}` : ""}
  `;
  const edgesWhere = `
    position_key = X'${keyHex}'
    ${edgesColorSql}
    and speed in (${speedSql})
    ${edgesPlayerSql}
    ${edgesDateSql}
  `;
  const gamesWhere = `
    g.position_key = X'${keyHex}'
    ${gamesColorSql}
    and g.speed in (${speedSql})
    ${gamesPlayerSql}
    ${gamesOpponentSql}
    ${gamesDateSql}
  `;
  const opponentRatingColumn = color === 0 ? "g.black_rating" : "g.white_rating";
  const detailsRatingFilter = username
    ? `and ${opponentRatingColumn} >= ${minRating}`
    : `and ((g.white_rating + g.black_rating) / 2.0) >= ${minRating}`;
  const movesSql = opponent
    ? `
      select
        g.next_uci as uci,
        count(*) as games,
        sum(case when g.winner = 1 then 1 else 0 end) as whiteWins,
        sum(case when g.winner = 0 then 1 else 0 end) as draws,
        sum(case when g.winner = 2 then 1 else 0 end) as blackWins,
        round(avg(${opponentRatingColumn})) as avgOpponentRating
      from opening_position_games g
      where ${gamesWhere}
        ${detailsRatingFilter}
      group by g.next_uci
      order by games desc
      limit 12;
    `
    : `
      select
        next_uci as uci,
        sum(games) as games,
        sum(white_wins) as whiteWins,
        sum(draws) as draws,
        sum(black_wins) as blackWins,
        round(sum(opponent_rating_sum) * 1.0 / sum(games)) as avgOpponentRating
      from opening_edges_daily
      where ${edgesWhere}
        and (opponent_rating_sum * 1.0 / games) >= ${minRating}
      group by next_uci
      order by games desc
      limit 12;
    `;
  const gamesGroupSql = username ? "" : "group by g.game_id, g.next_uci";
  const gamesSql = `
    select
      g.next_uci as uci,
      g.game_id as gameId,
      g.played_at as playedAt,
      g.played_on as playedOn,
      white_name.name as white,
      black_name.name as black,
      g.white_rating as whiteRating,
      g.black_rating as blackRating,
      g.winner as winner
    from opening_position_games g
    left join opening_names white_name on white_name.name_id = g.white_id
    left join opening_names black_name on black_name.name_id = g.black_id
    where ${gamesWhere}
      ${detailsRatingFilter}
    ${gamesGroupSql}
    order by g.played_at desc
    limit 8;
  `;

  try {
    const client = getClient();
    const [movesResult, gamesResult] = await Promise.all([
      client.execute(movesSql),
      client.execute(gamesSql),
    ]);
    const body = JSON.stringify({
      positionKey: keyHex,
      moves: normalizeRows(movesResult.rows),
      recentGames: normalizeRows(gamesResult.rows),
    });
    remember(cacheKey, body);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=30",
      },
      body,
    };
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Opening explorer query failed",
    });
  }
};
