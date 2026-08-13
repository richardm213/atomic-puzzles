import type { Client } from "@libsql/client";
import { describe, expect, it } from "vitest";

import { createSqliteRepository } from "../adapters/sqliteRepository.js";
import { createTursoRepository } from "../adapters/tursoRepository.js";
import { createOpeningExplorerService, type JsonRow } from "../core/service.js";

const FEN = "8/8/8/8/8/8/8/K6k w - - 0 1";

const fixtureRows = (sql: string): JsonRow[] => {
  if (sql.includes("key = 'aliases'")) return [{ value: '{"alias":"canonical"}' }];
  if (sql.includes("opening_position_player_leaders")) return [];
  if (sql.includes("position_player_leader_bands")) return [];
  if (sql.includes("savedGames")) return [{ savedGames: 0, savedRecentGames: 0 }];
  if (sql.includes("select n.name as username")) return [{ username: "canonical" }];
  if (sql.includes("limit 12")) {
    return [{ uci: "a1a2", games: 1200, whiteWins: 500, draws: 300, blackWins: 400 }];
  }
  if (sql.includes("limit 8")) {
    return [{ gameId: "fixture-game", uci: "a1a2", white: "canonical", black: "opponent" }];
  }
  return [];
};

const createServices = () => {
  const sqlite = createOpeningExplorerService(
    createSqliteRepository("data/openings.sqlite", async (sql) => fixtureRows(sql)),
  );
  const client = {
    execute: async (statement: string | { sql: string }) => ({
      rows: fixtureRows(typeof statement === "string" ? statement : statement.sql),
    }),
  } as unknown as Client;
  const turso = createOpeningExplorerService(
    createTursoRepository({ url: "libsql://contract.test", authToken: "test", client }),
  );
  return [sqlite, turso] as const;
};

const toParams = (values: object) =>
  new URLSearchParams(
    Object.entries(values).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );

const responseShape = (
  response: Awaited<ReturnType<ReturnType<typeof createOpeningExplorerService>["handle"]>>,
) => ({
  statusCode: response.statusCode,
  contentType: response.headers["Content-Type"],
  cacheControl: response.headers["Cache-Control"],
  body: JSON.parse(response.body),
});

describe("Opening Explorer repository adapter contract", () => {
  it.each([
    ["players", "/api/opening-players", {}],
    ["random player", "/api/opening-explorer", { randomPlayer: "1" }],
    ["general explorer", "/api/opening-explorer", { fen: FEN }],
    [
      "aliased player explorer",
      "/api/opening-explorer",
      { fen: FEN, username: "alias", color: "white", speeds: "0,1" },
    ],
  ])("returns the same %s response shape", async (_label, path, values) => {
    const [sqlite, turso] = createServices();
    const params = toParams(values);
    const [sqliteResponse, tursoResponse] = await Promise.all([
      sqlite.handle({ method: "GET", path, params }),
      turso.handle({ method: "GET", path, params }),
    ]);
    expect(responseShape(sqliteResponse)).toEqual(responseShape(tursoResponse));
  });

  it.each([
    { fen: "invalid" },
    { fen: FEN, color: "green" },
    { fen: FEN, speeds: "9" },
    { fen: FEN, unexpected: "1" },
  ])("applies identical request validation for $params", async (values) => {
    const [sqlite, turso] = createServices();
    const params = toParams(values);
    const [sqliteResponse, tursoResponse] = await Promise.all([
      sqlite.handle({ path: "/api/opening-explorer", params }),
      turso.handle({ path: "/api/opening-explorer", params }),
    ]);
    expect(responseShape(sqliteResponse)).toEqual(responseShape(tursoResponse));
    expect(sqliteResponse.statusCode).toBe(400);
  });
});
