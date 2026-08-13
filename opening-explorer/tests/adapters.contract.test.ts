import type { Client } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";

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

const serviceFactories = [
  [
    "SQLite",
    () =>
      createOpeningExplorerService(
        createSqliteRepository("data/openings.sqlite", async (sql) => fixtureRows(sql)),
      ),
  ],
  [
    "Turso",
    () => {
      const client = {
        execute: async (statement: string | { sql: string }) => ({
          rows: fixtureRows(typeof statement === "string" ? statement : statement.sql),
        }),
      } as unknown as Client;
      return createOpeningExplorerService(
        createTursoRepository({ url: "libsql://contract.test", authToken: "test", client }),
      );
    },
  ],
] as const;

describe.each(serviceFactories)("%s Opening Explorer adapter", (_name, createService) => {
  it("returns the public player-list payload", async () => {
    const response = await createService().handle({
      method: "GET",
      path: "/api/opening-players",
      params: new URLSearchParams(),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(response.body)).toEqual({ players: ["canonical"] });
  });

  it("returns the public explorer payload and resolves aliases", async () => {
    const response = await createService().handle({
      method: "GET",
      path: "/api/opening-explorer",
      params: new URLSearchParams({
        fen: FEN,
        username: "alias",
        color: "white",
        speeds: "0,1",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.parse(response.body)).toMatchObject({
      positionLeaders: null,
      moves: [{ uci: "a1a2", games: 1200, whiteWins: 500, draws: 300, blackWins: 400 }],
      recentGames: [{ gameId: "fixture-game", uci: "a1a2", white: "canonical", black: "opponent" }],
    });
  });

  it.each([
    [{ fen: "invalid" }, "Invalid fen query parameter"],
    [{ fen: FEN, color: "green" }, "Invalid color query parameter"],
    [{ fen: FEN, speeds: "9" }, "Invalid speeds query parameter"],
    [{ fen: FEN, unexpected: "1" }, "Unexpected query parameter: unexpected"],
  ])("returns the expected validation error for %#", async (values, error) => {
    const response = await createService().handle({
      path: "/api/opening-explorer",
      params: new URLSearchParams(values),
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["Cache-Control"]).toBe("no-store");
    expect(JSON.parse(response.body)).toEqual({ error });
  });
});

describe("Turso row normalization", () => {
  it("converts libSQL bigint values into JSON-safe numbers", async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [{ games: 1200n, username: "alice" }] });
    const repository = createTursoRepository({
      url: "libsql://contract.test",
      authToken: "test",
      client: { execute } as unknown as Client,
    });

    await expect(repository.query("select fixture", { value: 1 })).resolves.toEqual([
      { games: 1200, username: "alice" },
    ]);
  });
});
