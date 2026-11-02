import { createRequire } from "node:module";

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

import { describe, expect, it } from "vitest";

import {
  createOpeningExplorerService,
  type JsonRow,
  type OpeningExplorerRepository,
} from "../core/service.js";
import { positionKeyHex } from "../core/sql.js";

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const GENERAL_JAN = "0102cb060600000101901c01b401030c0707020100038c6002c80101be0102";
const GENERAL_FEB = "01010c070701000102d04101ac0204";
const GENERAL_TOTAL = "0102cb060600000101901c01b401030c070703010105dca10103ac0204c80101be0102";
const PLAYER_JAN = "01010c070701010002842002dc0101d20102";
const PLAYER_EXACT_RATINGS = "01020c072100000101a30d0164010c072201000001a40d01c80102";

const setup = (schema = "lichess-packed-month-v1") => {
  const db = new DatabaseSync(":memory:");
  const queries: string[] = [];
  const key = positionKeyHex(FEN);
  db.exec(`
    create table opening_names (name_id integer primary key, name text not null unique);
    create table opening_games (
      game_key integer primary key, game_id text not null unique, played_on integer not null,
      white_id integer, black_id integer, white_rating integer, black_rating integer,
      winner integer not null
    );
    create table general_month (
      position_key blob not null, speed integer not null, played_month integer not null,
      payload blob not null, primary key(position_key,speed,played_month)
    ) without rowid;
    create table player_month (
      player_id integer not null, player_color integer not null, speed integer not null,
      position_key blob not null, played_month integer not null, payload blob not null,
      primary key(player_id,player_color,speed,position_key,played_month)
    ) without rowid;
    create table general_total (
      position_key blob not null, speed integer not null, payload blob not null,
      primary key(position_key,speed)
    ) without rowid;
    create table player_total (
      player_id integer not null, player_color integer not null, speed integer not null,
      position_key blob not null, payload blob not null,
      primary key(player_id,player_color,speed,position_key)
    ) without rowid;
    create table player_opponent_month (
      player_id integer not null, opponent_id integer not null,
      player_color integer not null, speed integer not null,
      position_key blob not null, played_month integer not null, payload blob not null,
      primary key(player_id,opponent_id,player_color,speed,position_key,played_month)
    ) without rowid;
    create table opening_players (player_id integer primary key) without rowid;
    create table opening_index_meta (key text primary key, value text not null) without rowid;
    insert into opening_names values (1,'alice'),(2,'bob');
    insert into opening_players values (1);
    insert into opening_index_meta values
      ('schema','"${schema}"'),
      ('aliases','{"old-alice":"alice","old-bob":"bob"}');
    insert into opening_games values
      (1,'g1',20260120,1,2,2000,2100,1),
      (2,'g2',20260119,1,2,2000,2100,0),
      (3,'g3',20260118,2,1,1800,1800,2),
      (4,'g4',20260220,1,2,2100,2100,2);
    insert into general_month values
      (X'${key}',1,202601,X'${GENERAL_JAN}'),
      (X'${key}',0,202602,X'${GENERAL_FEB}');
    insert into player_month values
      (1,0,1,X'${key}',202601,X'${PLAYER_JAN}');
  `);
  if (schema === "lichess-packed-v2") {
    db.exec(`
      insert into general_month values (X'${key}',1,202602,X'${GENERAL_FEB}');
      insert into general_total values (X'${key}',1,X'${GENERAL_TOTAL}');
    `);
  }
  if (schema === "lichess-packed-v3") {
    db.exec(`
      delete from player_month;
      insert into player_month values
        (1,0,1,X'${key}',202601,X'${PLAYER_EXACT_RATINGS}');
      insert into player_opponent_month values
        (1,2,0,1,X'${key}',202601,X'${PLAYER_EXACT_RATINGS}');
    `);
  }
  const repository: OpeningExplorerRepository = {
    source: "packed-fixture",
    availability: () => ({ available: true, message: "" }),
    query: async (sql) => {
      queries.push(sql);
      return db.prepare(sql).all() as JsonRow[];
    },
  };
  return { db, queries, service: createOpeningExplorerService(repository) };
};

const request = (extra: Record<string, string> = {}) => ({
  path: "/api/opening-explorer",
  params: new URLSearchParams({ fen: FEN, speeds: "0,1", ...extra }),
});

describe("packed opening index compatibility", () => {
  it("merges speeds and months, applies the general rating divisor, and hydrates games", async () => {
    const { db, service } = setup();
    try {
      const response = await service.handle(request());
      const body = JSON.parse(response.body) as Record<string, unknown>;

      expect(response.statusCode).toBe(200);
      expect(String(body.positionKey)).toHaveLength(24);
      expect(body.moves).toEqual([
        {
          uci: "e2e4",
          games: 5,
          whiteWins: 3,
          draws: 1,
          blackWins: 1,
          avgOpponentRating: 2070,
        },
        {
          uci: "d2d4",
          games: 1,
          whiteWins: 0,
          draws: 0,
          blackWins: 1,
          avgOpponentRating: 1800,
        },
      ]);
      expect(body.recentGames).toMatchObject([
        { gameId: "g4", uci: "e2e4", playedAt: 300 },
        { gameId: "g1", uci: "e2e4", playedAt: 200 },
        { gameId: "g2", uci: "e2e4", playedAt: 190 },
        { gameId: "g3", uci: "d2d4", playedAt: 180 },
      ]);
    } finally {
      db.close();
    }
  });

  it("reuses immutable game metadata across general and player opening revisits", async () => {
    const { db, queries, service } = setup("lichess-packed-v3");
    try {
      await service.handle(request());
      const first = await service.handle(
        request({ username: "alice", color: "white", speeds: "1", minRating: "1700" }),
      );
      const second = await service.handle(
        request({ username: "alice", color: "white", speeds: "1", minRating: "1700" }),
      );

      expect(second.body).toBe(first.body);
      expect(queries.filter((sql) => sql.includes("from opening_games g"))).toHaveLength(1);
      expect(queries.filter((sql) => sql.includes("from player_total"))).toHaveLength(2);
    } finally {
      db.close();
    }
  });

  it("filters packed rows by month and resolves aliases for player payloads", async () => {
    const { db, service } = setup();
    try {
      const feb = await service.handle(request({ startDate: "2026-02", endDate: "2026-02" }));
      expect(JSON.parse(feb.body).moves).toMatchObject([{ uci: "e2e4", games: 2 }]);

      const player = await service.handle(
        request({ username: "old-alice", color: "white", speeds: "1" }),
      );
      expect(JSON.parse(player.body).moves).toEqual([
        {
          uci: "e2e4",
          games: 2,
          whiteWins: 1,
          draws: 1,
          blackWins: 0,
          avgOpponentRating: 2050,
        },
      ]);
    } finally {
      db.close();
    }
  });

  it("uses v2 lifetime payloads without also counting their monthly rows", async () => {
    const { db, service } = setup("lichess-packed-v2");
    try {
      const response = await service.handle(request({ speeds: "1" }));
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body).moves).toMatchObject([
        { uci: "e2e4", games: 5 },
        { uci: "d2d4", games: 1 },
      ]);
    } finally {
      db.close();
    }
  });

  it("supports exact 50-point rating boundaries and opponent aggregates in v3", async () => {
    const { db, service } = setup("lichess-packed-v3");
    try {
      const player = await service.handle(
        request({ username: "alice", color: "white", speeds: "1", minRating: "1700" }),
      );
      expect(player.statusCode).toBe(200);
      expect(JSON.parse(player.body).moves).toEqual([
        {
          uci: "e2e4",
          games: 1,
          whiteWins: 1,
          draws: 0,
          blackWins: 0,
          avgOpponentRating: 1700,
        },
      ]);

      const opponent = await service.handle(
        request({
          username: "alice",
          opponent: "old-bob",
          color: "white",
          speeds: "1",
          minRating: "1700",
        }),
      );
      expect(opponent.statusCode).toBe(200);
      expect(JSON.parse(opponent.body).moves).toMatchObject([{ uci: "e2e4", games: 1 }]);

      const aboveBoundary = await service.handle(
        request({ username: "alice", color: "white", speeds: "1", minRating: "1750" }),
      );
      expect(JSON.parse(aboveBoundary.body).moves).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("uses the player directory and rejects filters the packed index cannot reproduce", async () => {
    const { db, service } = setup();
    try {
      const players = await service.handle({
        path: "/api/opening-players",
        params: new URLSearchParams(),
      });
      expect(JSON.parse(players.body)).toEqual({ players: ["alice"] });

      const unsupportedFilters: Record<string, string>[] = [
        { opponent: "bob" },
        { minRating: "1800" },
      ];
      for (const filter of unsupportedFilters) {
        const response = await service.handle(request({ username: "alice", ...filter }));
        expect(response.statusCode).toBe(400);
        expect(JSON.parse(response.body)).toMatchObject({ code: "unsupported_filter" });
      }
    } finally {
      db.close();
    }
  });
});
