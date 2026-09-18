import { EXPLORER_CACHE_TTL_MS, MAX_CACHE_ENTRIES } from "./cachePolicy.js";
import { buildExplorerQueries, createExplorerQueryPlan } from "./queryPlan.js";
import {
  awaitExplorerRequest,
  createExplorerRequestLifecycle,
  type ExplorerNavigation,
} from "./requestLifecycle.js";
import { createPriorityFactory, OpeningExplorerQueueError } from "./requestQueue.js";
import { parseExplorerRequest } from "./requestSchema.js";
import {
  buildOpeningPlayersSql,
  buildPositionPlayerLeaderBandsSql,
  buildPositionPlayerLeadersSql,
  buildRandomOpeningPlayerSql,
  OPENING_EXPLORER_RESPONSE_SCHEMA,
  toPositionPlayerLeadersPayload,
} from "./sql.js";

export type PriorityRef = { value: number; lane?: number; signal?: AbortSignal };
export type JsonRow = Record<string, unknown>;

export interface OpeningExplorerRepository {
  readonly source: string;
  availability(): { available: boolean; message: string };
  signature(): string;
  query(sql: string, priorityRef: PriorityRef): Promise<JsonRow[]>;
  queryBatch?(sql: string[], priorityRef: PriorityRef): Promise<JsonRow[][]>;
}

export type ExplorerServiceRequest = {
  method?: string;
  path: string;
  params: URLSearchParams;
  intent?: string;
  navigation?: ExplorerNavigation | undefined;
  signal?: AbortSignal;
};

export type ExplorerServiceResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

type PendingRequest = {
  promise: Promise<{ body: string; shouldCache: boolean }>;
  priorityRef: PriorityRef;
};

const jsonResponse = (
  statusCode: number,
  body: unknown,
  shouldCache = statusCode === 200,
): ExplorerServiceResponse => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": shouldCache ? "public, max-age=30" : "no-store",
  },
  body: JSON.stringify(body),
});

const successResponse = (body: string, shouldCache: boolean): ExplorerServiceResponse => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": shouldCache ? "public, max-age=30" : "no-store",
  },
  body,
});

const aliasesFromRows = (rows: JsonRow[]): Map<string, string> => {
  const aliases = new Map<string, string>();
  const rawValue = rows[0]?.value;
  try {
    const raw = typeof rawValue === "string" ? JSON.parse(rawValue) : {};
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [alias, canonical] of Object.entries(raw)) {
        const aliasKey = alias.trim().toLowerCase();
        const canonicalValue = String(canonical).trim().toLowerCase();
        if (aliasKey && canonicalValue) aliases.set(aliasKey, canonicalValue);
      }
    }
  } catch {
    // Alias metadata is optional and older databases may contain no usable value.
  }
  return aliases;
};

export const createOpeningExplorerService = (repository: OpeningExplorerRepository) => {
  const cache = new Map<string, { body: string; expiresAt: number; shouldCache: boolean }>();
  const pendingCache = new Map<string, PendingRequest>();
  // Short TTLs keep warm function instances current after an index refresh.
  const cacheTtlMs = EXPLORER_CACHE_TTL_MS;
  const metadataCache = new Map<string, { promise: Promise<JsonRow[]>; expiresAt: number }>();
  const metadata = (sql: string, priorityRef: PriorityRef): Promise<JsonRow[]> => {
    const key = `${repository.signature()}:${sql}`;
    const cached = metadataCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.promise;
    const promise = repository
      .query(sql, { value: priorityRef.value, lane: priorityRef.lane ?? 1 })
      .catch((error: unknown) => {
        if (metadataCache.get(key)?.promise === promise) metadataCache.delete(key);
        throw error;
      });
    if (metadataCache.size >= 16) metadataCache.clear();
    metadataCache.set(key, { promise, expiresAt: Date.now() + cacheTtlMs });
    return promise;
  };
  const nextPriority = createPriorityFactory();
  const beginRequest = createExplorerRequestLifecycle();

  const resolveCanonicalUsername = async (
    username: string,
    priorityRef: PriorityRef,
  ): Promise<string> => {
    if (!username) return "";
    try {
      const aliases = aliasesFromRows(
        await awaitExplorerRequest(
          metadata(
            "select value from opening_index_meta where key = 'aliases' limit 1;",
            priorityRef,
          ),
          priorityRef.signal,
        ),
      );
      return aliases.get(username) ?? username;
    } catch {
      priorityRef.signal?.throwIfAborted();
      return username;
    }
  };

  const fetchPositionPlayerLeaders = async (
    keyHex: string,
    lastMoveColor: number | null,
    priorityRef: PriorityRef,
  ) => {
    if (lastMoveColor !== 0 && lastMoveColor !== 1) return null;
    try {
      const [leaders, bands] = await Promise.all([
        repository.query(buildPositionPlayerLeadersSql(keyHex, lastMoveColor), priorityRef),
        metadata(buildPositionPlayerLeaderBandsSql(), priorityRef),
      ]);
      return toPositionPlayerLeadersPayload(leaders, bands[0]?.value);
    } catch {
      return null;
    }
  };

  const handle = async (request: ExplorerServiceRequest): Promise<ExplorerServiceResponse> => {
    const method = request.method ?? "GET";
    if (method !== "GET") return jsonResponse(405, { error: "Method not allowed" }, false);

    const parsed = parseExplorerRequest(request.path, request.params);
    if (!parsed.ok) return jsonResponse(400, { error: parsed.error }, false);

    const availability = repository.availability();
    if (parsed.request.kind === "health") {
      return jsonResponse(200, {
        ok: true,
        configured: availability.available,
        schema: OPENING_EXPLORER_RESPONSE_SCHEMA,
        source: repository.source,
      });
    }
    if (!availability.available) return jsonResponse(503, { error: availability.message }, false);

    const priorityRef: PriorityRef = nextPriority(request.intent?.toLowerCase() ?? "");
    let lifecycle: ReturnType<typeof beginRequest> | undefined;
    try {
      lifecycle = beginRequest(
        parsed.request.kind === "explorer" ? request.navigation : undefined,
        request.signal,
      );
      priorityRef.signal = lifecycle.signal;
      priorityRef.signal.throwIfAborted();
      if (parsed.request.kind === "players") {
        const players = (await repository.query(buildOpeningPlayersSql(), priorityRef))
          .map((row) => String(row.username ?? "").trim())
          .filter(Boolean);
        return jsonResponse(200, { players });
      }
      if (parsed.request.kind === "randomPlayer") {
        const username = String(
          (await repository.query(buildRandomOpeningPlayerSql(), priorityRef))[0]?.username ?? "",
        ).trim();
        return username
          ? jsonResponse(200, { username })
          : jsonResponse(404, { error: "No opening database players are available" }, false);
      }

      const signature = repository.signature();
      const username = await resolveCanonicalUsername(
        parsed.request.requestedUsername,
        priorityRef,
      );
      const opponent = username
        ? await resolveCanonicalUsername(parsed.request.requestedOpponent, priorityRef)
        : "";
      priorityRef.signal.throwIfAborted();
      const plan = createExplorerQueryPlan({
        databaseSignature: signature,
        ...parsed.request,
        username,
        opponent,
      });

      const cached = cache.get(plan.cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        cache.delete(plan.cacheKey);
        cache.set(plan.cacheKey, cached);
        return successResponse(cached.body, cached.shouldCache);
      }
      cache.delete(plan.cacheKey);
      // Navigation-scoped work must not share cancellation with another visitor.
      // Legacy unscoped callers can still coalesce identical in-flight work.
      const pendingKey = request.navigation || request.signal ? null : plan.cacheKey;
      const pending = pendingKey ? pendingCache.get(pendingKey) : undefined;
      if (pending) {
        try {
          pending.priorityRef.value = Math.max(pending.priorityRef.value, priorityRef.value);
          pending.priorityRef.lane = Math.max(pending.priorityRef.lane ?? 1, priorityRef.lane ?? 1);
          const result = await awaitExplorerRequest(pending.promise, priorityRef.signal);
          return successResponse(result.body, result.shouldCache);
        } catch {
          priorityRef.signal.throwIfAborted();
          // Retry below when the shared request failed.
        }
      }

      const bodyPromise = (async () => {
        const extrasPromise = plan.includePositionExtras
          ? fetchPositionPlayerLeaders(plan.keyHex, plan.lastMoveColor, priorityRef)
          : Promise.resolve(null);
        const { gamesSql, movesSql } = buildExplorerQueries(plan);
        const results = repository.queryBatch
          ? repository.queryBatch([movesSql, gamesSql], priorityRef)
          : Promise.all([
              repository.query(movesSql, priorityRef),
              repository.query(gamesSql, priorityRef),
            ]);
        const [rows, positionLeaders] = await Promise.all([results, extrasPromise]);
        const [moves = [], recentGames = []] = rows;
        // Personalized results are cached internally by every filter, but never
        // advertised as publicly cacheable to a browser/CDN.
        const shouldCache = !plan.username && !plan.opponent;
        return {
          body: JSON.stringify({
            positionKey: plan.keyHex,
            positionLeaders,
            moves,
            recentGames,
          }),
          shouldCache,
        };
      })();

      if (pendingKey) pendingCache.set(pendingKey, { promise: bodyPromise, priorityRef });
      try {
        const result = await awaitExplorerRequest(bodyPromise, priorityRef.signal);
        priorityRef.signal.throwIfAborted();
        if (cache.size >= MAX_CACHE_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(plan.cacheKey, { ...result, expiresAt: Date.now() + cacheTtlMs });
        return successResponse(result.body, result.shouldCache);
      } finally {
        if (pendingKey && pendingCache.get(pendingKey)?.promise === bodyPromise)
          pendingCache.delete(pendingKey);
      }
    } catch (error) {
      const statusCode = error instanceof OpeningExplorerQueueError ? error.statusCode : 500;
      return jsonResponse(
        statusCode,
        { error: error instanceof Error ? error.message : "Opening explorer query failed" },
        false,
      );
    } finally {
      lifecycle?.release();
    }
  };

  return { handle };
};
