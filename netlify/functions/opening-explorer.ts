import { createClient } from "@libsql/client/web";

import {
  createOpeningExplorerQueue,
  createPriorityFactory,
  OpeningExplorerQueueError,
} from "../../opening-explorer-request-queue.js";
import {
  buildGeneralSavedStatusSql,
  buildOpeningExplorerSql,
  buildPositionPlayerLeaderBandsSql,
  buildPositionPlayerLeadersSql,
  lastMoveColorFromFen,
  OPENING_EXPLORER_RESPONSE_SCHEMA,
  positionKeyHex,
  selectGeneralExplorerSources,
  sqlMonthBounds,
  toPositionPlayerLeadersPayload,
} from "../../opening-explorer-sql.js";

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
const PLAYER_MIN_RATING = 1700;
const MAX_EXPLORER_RATING = 2200;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 90;
const MAX_TURSO_CONCURRENT_QUERIES = 3;
const MAX_TURSO_QUEUED_QUERIES = 36;
const HIGH_VOLUME_GENERAL_CACHE_MIN_GAMES = 1_000;
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
type PriorityRef = { value: number };
type ExplorerResponsePayload = {
  body: string;
  shouldCache: boolean;
};
type PendingExplorerRequest = {
  promise: Promise<ExplorerResponsePayload>;
  priorityRef: PriorityRef;
};
const cache = new Map<string, string>();
const pendingCache = new Map<string, PendingExplorerRequest>();
const aliasCache = new Map<string, Map<string, string>>();
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const nextTursoPriority = createPriorityFactory();
const tursoQueue = createOpeningExplorerQueue({
  maxConcurrent: MAX_TURSO_CONCURRENT_QUERIES,
  maxQueued: MAX_TURSO_QUEUED_QUERIES,
});
const enqueueTursoQuery = <T>(run: () => Promise<T>, priorityRef: PriorityRef): Promise<T> =>
  tursoQueue.enqueue(run, priorityRef) as Promise<T>;

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

const jsonResponse = (statusCode: number, body: JsonValue) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": statusCode === 200 ? "public, max-age=30" : "no-store",
  },
  body: JSON.stringify(body),
});

const explorerSuccessHeaders = (shouldCache: boolean) => ({
  "Content-Type": "application/json",
  "Cache-Control": shouldCache ? "public, max-age=30" : "no-store",
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

const parseColor = (value: string | null): 0 | 1 | "all" | null => {
  if (!value) return "all";
  if (value === "white") return 0;
  if (value === "black") return 1;
  return null;
};

const parsePlayerMinRating = (value: string | null): number => {
  if (!value) return PLAYER_MIN_RATING;
  if (!/^\d{3,4}$/.test(value)) return PLAYER_MIN_RATING;

  const rating = Number.parseInt(value, 10);
  if (!Number.isFinite(rating)) return PLAYER_MIN_RATING;
  return Math.max(PLAYER_MIN_RATING, Math.min(MAX_EXPLORER_RATING, rating));
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

const shouldCacheExplorerResponse = ({
  moves,
  opponent,
  username,
}: {
  moves: Record<string, JsonValue>[];
  opponent: string;
  username: string;
}): boolean => {
  if (username || opponent) return false;

  const shownGames = moves.reduce((total, row) => total + Number(row.games ?? 0), 0);
  return shownGames >= HIGH_VOLUME_GENERAL_CACHE_MIN_GAMES;
};

const resolveCanonicalUsername = async (
  username: string,
  databaseUrl: string,
  priorityRef: PriorityRef,
): Promise<string> => {
  if (!username) return "";

  const cachedAliases = aliasCache.get(databaseUrl);
  if (cachedAliases) {
    return cachedAliases.get(username) ?? username;
  }

  const aliases = new Map<string, string>();

  try {
    const client = getClient();
    const result = await enqueueTursoQuery(
      () => client.execute("select value from opening_index_meta where key = 'aliases' limit 1;"),
      priorityRef,
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

const fetchPositionPlayerLeaders = async (
  keyHex: string,
  lastMoveColor: number | null,
  priorityRef: PriorityRef,
) => {
  if (lastMoveColor !== 0 && lastMoveColor !== 1) return null;

  try {
    const client = getClient();
    const [leadersResult, bandsResult] = await Promise.all([
      enqueueTursoQuery(
        () => client.execute(buildPositionPlayerLeadersSql(keyHex, lastMoveColor)),
        priorityRef,
      ),
      enqueueTursoQuery(() => client.execute(buildPositionPlayerLeaderBandsSql()), priorityRef),
    ]);
    const leaderRows = normalizeRows(leadersResult.rows);
    const bandRows = normalizeRows(bandsResult.rows);

    return toPositionPlayerLeadersPayload(leaderRows, bandRows[0]?.value);
  } catch {
    // Keep the main explorer available while the optional leader table rolls out.
    return null;
  }
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
      schema: OPENING_EXPLORER_RESPONSE_SCHEMA,
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

  const requestIntent = getHeader(event, "x-explorer-intent").toLowerCase();
  const priorityRef = nextTursoPriority(requestIntent);

  const requestedUsername = parseUsername(params.get("username"));
  if (requestedUsername === null) {
    return jsonResponse(400, { error: "Invalid username query parameter" });
  }

  const username = await resolveCanonicalUsername(requestedUsername, databaseUrl, priorityRef);
  const requestedOpponent = parseUsername(params.get("opponent"));
  if (requestedOpponent === null) {
    return jsonResponse(400, { error: "Invalid opponent query parameter" });
  }
  const opponent = username
    ? await resolveCanonicalUsername(requestedOpponent, databaseUrl, priorityRef)
    : "";
  const requestedColor = parseColor(params.get("color"));
  if (requestedColor === null) {
    return jsonResponse(400, { error: "Invalid color query parameter" });
  }
  const color = username && requestedColor === "all" ? 0 : requestedColor;

  const playerMinRating = username ? parsePlayerMinRating(params.get("minRating")) : null;
  const queryMinRating = playerMinRating ?? PLAYER_MIN_RATING;

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
  const lastMoveColor = lastMoveColorFromFen(fen);
  const includePositionExtras = !username;
  const cacheKey = JSON.stringify({
    responseSchema: OPENING_EXPLORER_RESPONSE_SCHEMA,
    source: "turso",
    databaseUrl,
    fen,
    color,
    requestedUsername,
    username,
    requestedOpponent,
    opponent,
    playerMinRating,
    speeds,
    startDate,
    endDate,
  });
  const cached = cache.get(cacheKey);
  if (cached) {
    return {
      statusCode: 200,
      headers: explorerSuccessHeaders(true),
      body: cached,
    };
  }

  const pending = pendingCache.get(cacheKey);
  if (pending) {
    try {
      pending.priorityRef.value = Math.max(pending.priorityRef.value, priorityRef.value);
      const { body, shouldCache } = await pending.promise;
      return {
        statusCode: 200,
        headers: explorerSuccessHeaders(shouldCache),
        body,
      };
    } catch {
      // Run the query below if the shared pending request failed.
    }
  }

  try {
    const client = getClient();
    const positionExtrasPromise = includePositionExtras
      ? fetchPositionPlayerLeaders(keyHex, lastMoveColor, priorityRef)
      : Promise.resolve(null);
    let generalSources = {};

    const bodyPromise = (async () => {
      if (!username && !opponent) {
        const savedStatusResult = await enqueueTursoQuery(
          () => client.execute(buildGeneralSavedStatusSql({ endDate, keyHex, speeds, startDate })),
          priorityRef,
        );
        const [savedStatus = {}] = normalizeRows(savedStatusResult.rows);
        generalSources = selectGeneralExplorerSources({
          endDate,
          savedGames: Number(savedStatus.savedGames ?? 0),
          savedRecentGames: Number(savedStatus.savedRecentGames ?? 0),
          speeds,
          startDate,
        });
      }

      const { gamesSql, movesSql } = buildOpeningExplorerSql({
        color,
        endDate,
        keyHex,
        opponent,
        playerMinRating: queryMinRating,
        speeds,
        startDate,
        username,
        ...generalSources,
      });

      const [movesResult, gamesResult, positionLeaders] = await Promise.all([
        enqueueTursoQuery(() => client.execute(movesSql), priorityRef),
        enqueueTursoQuery(() => client.execute(gamesSql), priorityRef),
        positionExtrasPromise,
      ]);

      const moves = normalizeRows(movesResult.rows);
      const recentGames = normalizeRows(gamesResult.rows);
      const shouldCache = shouldCacheExplorerResponse({ moves, opponent, username });

      return {
        body: JSON.stringify({
          positionKey: keyHex,
          positionLeaders,
          moves,
          recentGames,
        }),
        shouldCache,
      };
    })();

    pendingCache.set(cacheKey, { promise: bodyPromise, priorityRef });
    const { body, shouldCache } = await bodyPromise;
    if (shouldCache) {
      remember(cacheKey, body);
    }

    return {
      statusCode: 200,
      headers: explorerSuccessHeaders(shouldCache),
      body,
    };
  } catch (error) {
    const statusCode = error instanceof OpeningExplorerQueueError ? error.statusCode : 500;
    return jsonResponse(statusCode, {
      error: error instanceof Error ? error.message : "Opening explorer query failed",
    });
  } finally {
    pendingCache.delete(cacheKey);
  }
};
