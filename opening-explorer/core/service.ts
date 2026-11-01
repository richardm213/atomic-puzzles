import {
  buildOpeningPlayersSql as buildLegacyOpeningPlayersSql,
  buildRandomOpeningPlayerSql as buildLegacyRandomOpeningPlayerSql,
  OPENING_EXPLORER_RESPONSE_SCHEMA as LEGACY_RESPONSE_SCHEMA,
} from "./legacySql.js";
import { hydratePackedRecentGames, mergePackedPayloads } from "./packedPayload.js";
import { buildExplorerQueries, createExplorerQueryPlan } from "./queryPlan.js";
import {
  awaitExplorerRequest,
  createExplorerRequestLifecycle,
  type ExplorerNavigation,
} from "./requestLifecycle.js";
import { createPriorityFactory, OpeningExplorerQueueError } from "./requestQueue.js";
import { parseExplorerRequest } from "./requestSchema.js";
import {
  buildOpeningGamesSql,
  buildOpeningPlayersSql,
  buildPackedPayloadSql,
  buildRandomOpeningPlayerSql,
  OPENING_EXPLORER_RESPONSE_SCHEMA,
  PACKED_INDEX_SCHEMA,
  PACKED_INDEX_SCHEMA_WITH_FILTERS,
  PACKED_INDEX_SCHEMA_WITH_TOTALS,
  positionKeyHex,
} from "./sql.js";

export type PriorityRef = { value: number; lane?: number; signal?: AbortSignal };
export type JsonRow = Record<string, unknown>;

export interface OpeningExplorerRepository {
  readonly source: string;
  availability(): { available: boolean; message: string };
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

const responseHeaders = (shouldCache: boolean): Record<string, string> => ({
  "Content-Type": "application/json",
  "Cache-Control": shouldCache ? "public, max-age=30" : "no-store",
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

const successResponse = (body: unknown, shouldCache: boolean): ExplorerServiceResponse =>
  jsonResponse(200, body, shouldCache);

const packedSchemaSql = "select value from opening_index_meta where key = 'schema' limit 1;";

const metadataValue = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const createOpeningExplorerService = (repository: OpeningExplorerRepository) => {
  const nextPriority = createPriorityFactory();
  const beginRequest = createExplorerRequestLifecycle();
  let packedSchemaPromise: Promise<string | null> | null = null;

  const packedSchemaVersion = (priorityRef: PriorityRef): Promise<string | null> => {
    packedSchemaPromise ??= repository
      .query(packedSchemaSql, { value: priorityRef.value, lane: priorityRef.lane ?? 1 })
      .then((rows) => {
        const schema = metadataValue(rows[0]?.value);
        return schema === PACKED_INDEX_SCHEMA ||
          schema === PACKED_INDEX_SCHEMA_WITH_TOTALS ||
          schema === PACKED_INDEX_SCHEMA_WITH_FILTERS
          ? schema
          : null;
      })
      .catch((error: unknown) => {
        packedSchemaPromise = null;
        throw error;
      });
    return packedSchemaPromise;
  };

  const packedExplorerResponse = async (
    request: Extract<ReturnType<typeof parseExplorerRequest>, { ok: true }>["request"] & {
      kind: "explorer";
    },
    priorityRef: PriorityRef,
    useTotals: boolean,
    supportsFilters: boolean,
  ): Promise<ExplorerServiceResponse> => {
    if (!supportsFilters && (request.requestedOpponent || request.playerMinRating !== null)) {
      return jsonResponse(
        400,
        {
          error:
            "The packed opening index does not support opponent or exact minimum-rating filters.",
          code: "unsupported_filter",
        },
        false,
      );
    }
    const username = request.requestedUsername;
    const color = username && request.requestedColor === "all" ? 0 : request.requestedColor;
    const keyHex = positionKeyHex(request.fen);
    const payloadRows = await awaitExplorerRequest(
      repository.query(
        buildPackedPayloadSql({
          color,
          endDate: request.endDate,
          keyHex,
          opponent: request.requestedOpponent,
          speeds: request.speeds,
          startDate: request.startDate,
          username,
          useTotals,
        }),
        priorityRef,
      ),
      priorityRef.signal,
    );
    const { moves, recent } = mergePackedPayloads(
      payloadRows.map((row) => row.payload),
      username ? 1 : 2,
      username && supportsFilters ? request.playerMinRating : null,
    );
    const gamesSql = buildOpeningGamesSql(recent.map((game) => game.gameKey));
    const gameRows = gamesSql
      ? await awaitExplorerRequest(repository.query(gamesSql, priorityRef), priorityRef.signal)
      : [];
    return successResponse(
      {
        positionKey: keyHex,
        moves,
        recentGames: hydratePackedRecentGames(recent, gameRows),
      },
      !username,
    );
  };

  const legacyExplorerResponse = async (
    request: Extract<ReturnType<typeof parseExplorerRequest>, { ok: true }>["request"] & {
      kind: "explorer";
    },
    priorityRef: PriorityRef,
  ): Promise<ExplorerServiceResponse> => {
    const username = request.requestedUsername;
    const opponent = username ? request.requestedOpponent : "";
    const plan = createExplorerQueryPlan({
      ...request,
      username,
      opponent,
    });
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
    const [moves = [], recentGames = []] = await awaitExplorerRequest(results, priorityRef.signal);
    return successResponse(
      { positionKey: plan.keyHex, moves, recentGames },
      !plan.username && !plan.opponent,
    );
  };

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
        legacySchema: LEGACY_RESPONSE_SCHEMA,
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
      const packedSchema = await awaitExplorerRequest(
        packedSchemaVersion(priorityRef),
        priorityRef.signal,
      );
      priorityRef.signal.throwIfAborted();

      if (parsed.request.kind === "players") {
        const sql = packedSchema ? buildOpeningPlayersSql() : buildLegacyOpeningPlayersSql();
        const players = (await repository.query(sql, priorityRef))
          .map((row) => String(row.username ?? "").trim())
          .filter(Boolean);
        return jsonResponse(200, { players });
      }
      if (parsed.request.kind === "randomPlayer") {
        const sql = packedSchema
          ? buildRandomOpeningPlayerSql()
          : buildLegacyRandomOpeningPlayerSql();
        const username = String(
          (await repository.query(sql, priorityRef))[0]?.username ?? "",
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

      return packedSchema
        ? await packedExplorerResponse(
            parsed.request,
            priorityRef,
            packedSchema !== PACKED_INDEX_SCHEMA,
            packedSchema === PACKED_INDEX_SCHEMA_WITH_FILTERS,
          )
        : await legacyExplorerResponse(parsed.request, priorityRef);
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
