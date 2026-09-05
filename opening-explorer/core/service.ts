import { rememberCacheEntry, shouldCacheExplorerResponse } from "./cachePolicy.js";
import {
  buildExplorerQueries,
  buildSavedStatusQuery,
  createExplorerQueryPlan,
} from "./queryPlan.js";
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

export type PriorityRef = { value: number };
export type JsonRow = Record<string, unknown>;

export interface OpeningExplorerRepository {
  readonly source: string;
  availability(): { available: boolean; message: string };
  signature(): string;
  query(sql: string, priorityRef: PriorityRef): Promise<JsonRow[]>;
}

export type ExplorerServiceRequest = {
  method?: string;
  path: string;
  params: URLSearchParams;
  intent?: string;
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
  const cache = new Map<string, string>();
  const pendingCache = new Map<string, PendingRequest>();
  const aliasCache = new Map<string, Map<string, string>>();
  const nextPriority = createPriorityFactory();

  const resolveCanonicalUsername = async (
    username: string,
    signature: string,
    priorityRef: PriorityRef,
  ): Promise<string> => {
    if (!username) return "";
    let aliases = aliasCache.get(signature);
    if (!aliases) {
      try {
        aliases = aliasesFromRows(
          await repository.query(
            "select value from opening_index_meta where key = 'aliases' limit 1;",
            priorityRef,
          ),
        );
      } catch {
        aliases = new Map();
      }
      aliasCache.set(signature, aliases);
    }
    return aliases.get(username) ?? username;
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
        repository.query(buildPositionPlayerLeaderBandsSql(), priorityRef),
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

    const priorityRef = nextPriority(request.intent?.toLowerCase() ?? "");
    try {
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
        signature,
        priorityRef,
      );
      const opponent = username
        ? await resolveCanonicalUsername(parsed.request.requestedOpponent, signature, priorityRef)
        : "";
      const plan = createExplorerQueryPlan({
        databaseSignature: signature,
        ...parsed.request,
        username,
        opponent,
      });

      const cached = cache.get(plan.cacheKey);
      if (cached) return successResponse(cached, true);
      const pending = pendingCache.get(plan.cacheKey);
      if (pending) {
        try {
          pending.priorityRef.value = Math.max(pending.priorityRef.value, priorityRef.value);
          const result = await pending.promise;
          return successResponse(result.body, result.shouldCache);
        } catch {
          // Retry below when the shared request failed.
        }
      }

      const bodyPromise = (async () => {
        const extrasPromise = plan.includePositionExtras
          ? fetchPositionPlayerLeaders(plan.keyHex, plan.lastMoveColor, priorityRef)
          : Promise.resolve(null);
        const savedSql = buildSavedStatusQuery(plan);
        const savedStatus = savedSql
          ? ((await repository.query(savedSql, priorityRef))[0] ?? {})
          : {};
        const { gamesSql, movesSql } = buildExplorerQueries(plan, savedStatus);
        const [moves, recentGames, positionLeaders] = await Promise.all([
          repository.query(movesSql, priorityRef),
          repository.query(gamesSql, priorityRef),
          extrasPromise,
        ]);
        const shouldCache = shouldCacheExplorerResponse({
          moves,
          opponent: plan.opponent,
          username: plan.username,
        });
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

      pendingCache.set(plan.cacheKey, { promise: bodyPromise, priorityRef });
      try {
        const result = await bodyPromise;
        if (result.shouldCache) rememberCacheEntry(cache, plan.cacheKey, result.body);
        return successResponse(result.body, result.shouldCache);
      } finally {
        pendingCache.delete(plan.cacheKey);
      }
    } catch (error) {
      const statusCode = error instanceof OpeningExplorerQueueError ? error.statusCode : 500;
      return jsonResponse(
        statusCode,
        { error: error instanceof Error ? error.message : "Opening explorer query failed" },
        false,
      );
    }
  };

  return { handle };
};
