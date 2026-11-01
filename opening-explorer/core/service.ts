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
  buildRandomOpeningPlayerSql,
  OPENING_EXPLORER_RESPONSE_SCHEMA,
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

const PUBLIC_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=30",
  // General explorer results and the player directory are public and immutable
  // between database refreshes. Keep them hot at Netlify long enough that an
  // opening line does not repeatedly pay Turso's cold-page cost; stale responses
  // remain immediately usable while the edge refreshes them in the background.
  "Netlify-CDN-Cache-Control": "public, durable, s-maxage=3600, stale-while-revalidate=86400",
};

const responseHeaders = (shouldCache: boolean): Record<string, string> => ({
  "Content-Type": "application/json",
  ...(shouldCache ? PUBLIC_CACHE_HEADERS : { "Cache-Control": "no-store" }),
});

const jsonResponse = (
  statusCode: number,
  body: unknown,
  shouldCache = statusCode === 200,
): ExplorerServiceResponse => ({
  statusCode,
  headers: responseHeaders(shouldCache),
  body: JSON.stringify(body),
});

const successResponse = (body: string, shouldCache: boolean): ExplorerServiceResponse => ({
  statusCode: 200,
  headers: responseHeaders(shouldCache),
  body,
});

export const createOpeningExplorerService = (repository: OpeningExplorerRepository) => {
  const cache = new Map<string, { body: string; expiresAt: number; shouldCache: boolean }>();
  const pendingCache = new Map<string, PendingRequest>();
  // Short TTLs keep warm function instances current after an index refresh.
  const cacheTtlMs = EXPLORER_CACHE_TTL_MS;
  const nextPriority = createPriorityFactory();
  const beginRequest = createExplorerRequestLifecycle();

  const handle = async (request: ExplorerServiceRequest): Promise<ExplorerServiceResponse> => {
    const method = request.method ?? "GET";
    if (method !== "GET") {
      const response = jsonResponse(
        405,
        { error: "Method not allowed", code: "method_not_allowed" },
        false,
      );
      response.headers.Allow = "GET, OPTIONS";
      return response;
    }

    const parsed = parseExplorerRequest(request.path, request.params);
    if (!parsed.ok) {
      return jsonResponse(400, { error: parsed.error, code: "validation_failed" }, false);
    }

    const availability = repository.availability();
    if (parsed.request.kind === "health") {
      return jsonResponse(200, {
        ok: true,
        configured: availability.available,
        schema: OPENING_EXPLORER_RESPONSE_SCHEMA,
        source: repository.source,
      });
    }
    if (!availability.available) {
      return jsonResponse(503, { error: availability.message, code: "service_unavailable" }, false);
    }

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
          ? jsonResponse(200, { username }, false)
          : jsonResponse(
              404,
              {
                error: "No opening database players are available",
                code: "player_not_found",
              },
              false,
            );
      }

      const signature = repository.signature();
      // Alias lookup is embedded in the main SQL statement. Personalized cold
      // requests therefore make one Turso round trip instead of waiting for a
      // metadata request before the actual explorer query can start.
      const username = parsed.request.requestedUsername;
      const opponent = username ? parsed.request.requestedOpponent : "";
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
        const { gamesSql, movesSql, combinedSql } = buildExplorerQueries(plan);
        const results = combinedSql
          ? repository.query(combinedSql, priorityRef).then((rows) => {
              const row = rows[0];
              const moves: unknown = JSON.parse(String(row?.movesJson ?? "null"));
              const games: unknown = JSON.parse(String(row?.recentGamesJson ?? "null"));
              if (!Array.isArray(moves) || !Array.isArray(games)) {
                throw new Error("Opening explorer returned invalid combined results");
              }
              return [moves as JsonRow[], games as JsonRow[]];
            })
          : repository.queryBatch
            ? repository.queryBatch([movesSql, gamesSql], priorityRef)
            : Promise.all([
                repository.query(movesSql, priorityRef),
                repository.query(gamesSql, priorityRef),
              ]);
        const rows = await results;
        const [moves = [], recentGames = []] = rows;
        // Personalized results are cached internally by every filter, but never
        // advertised as publicly cacheable to a browser/CDN.
        const shouldCache = !plan.username && !plan.opponent;
        return {
          body: JSON.stringify({
            positionKey: plan.keyHex,
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
        {
          error: error instanceof Error ? error.message : "Opening explorer query failed",
          code: error instanceof OpeningExplorerQueueError ? "queue_unavailable" : "internal_error",
        },
        false,
      );
    } finally {
      lifecycle?.release();
    }
  };

  return { handle };
};
