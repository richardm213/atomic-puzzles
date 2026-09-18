import { createRequire } from "node:module";

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

import { describe, expect, it } from "vitest";

import { buildOpeningExplorerSql } from "../core/sql.js";

const keyHex = "007a07e2907927020b305efdb129dc37";
const setup = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    create table opening_position_moves_monthly (
      position_key blob, speed int, played_month int, next_uci text, games int,
      white_wins int, draws int, black_wins int, rated_games int, rating_pair_sum int,
      primary key(position_key,speed,played_month,next_uci)
    ) without rowid;
    create table opening_position_games (
      canonical_player_id int, position_key blob, speed int, next_uci text, game_id text,
      played_at int, played_on int, white_id int, black_id int,
      white_rating int, black_rating int, winner int
    );
    create index raw_lookup on opening_position_games(position_key,speed,played_at desc);
    create table opening_position_recent_games as select * from opening_position_games where 0;
    create index recent_lookup on opening_position_recent_games(position_key,speed,played_at desc);
    create table opening_names (name_id integer primary key, name text unique);
    insert into opening_names values (1,'alice'),(2,'bob');
    insert into opening_position_moves_monthly values
      (X'${keyHex}',1,202501,'e2e4',1177,700,77,400,1000,4000000);
  `);
  const add = db.prepare(
    "insert into opening_position_games values (?, ?, ?, 'e2e4', ?, ?, ?, 1,2,1800,2200,1)",
  );
  const key = Buffer.from(keyHex, "hex");
  for (let i = 0; i < 12; i++) {
    // Same game indexed under both players: must count once.
    add.run(1, key, 0, `bullet${i}`, i + 10, 20250201);
    add.run(2, key, 0, `bullet${i}`, i + 10, 20250201);
  }
  db.exec(`insert into opening_position_recent_games values
    (1,X'${keyHex}',1,'e2e4','blitz',100,20250101,1,2,2000,2000,2);`);
  return db;
};
const queries = (overrides = {}) =>
  buildOpeningExplorerSql({
    keyHex,
    speeds: [0, 1, 2],
    color: "all",
    username: "",
    opponent: "",
    playerMinRating: 1700,
    startDate: null,
    endDate: null,
    ...overrides,
  });

describe("saved speed buckets", () => {
  it("merges covered blitz and uncovered bullet without duplicating raw games", () => {
    const db = setup();
    try {
      const { movesSql, gamesSql } = queries();
      expect(db.prepare(movesSql).all()).toEqual([
        {
          uci: "e2e4",
          games: 1189,
          whiteWins: 712,
          draws: 77,
          blackWins: 400,
          avgOpponentRating: 2000,
        },
      ]);
      const recent = db.prepare(gamesSql).all();
      expect(recent).toHaveLength(8);
      expect(recent[0]?.gameId).toBe("blitz");
      expect(new Set(recent.map((row) => row.gameId)).size).toBe(8);
      expect(recent[1]?.gameId).toBe("bullet11");
      expect(gamesSql).toContain("exists(select 1 from opening_position_recent_games");
    } finally {
      db.close();
    }
  });

  it("reads raw entries once when neither speed has saved data", () => {
    const db = setup();
    try {
      db.exec(`delete from opening_position_moves_monthly;
        delete from opening_position_recent_games;
        insert into opening_position_games values
          (1,X'${keyHex}',1,'d2d4','blitz1',100,20250202,1,2,1800,2200,1),
          (2,X'${keyHex}',1,'d2d4','blitz1',100,20250202,1,2,1800,2200,1),
          (1,X'${keyHex}',1,'d2d4','blitz2',101,20250202,1,2,1800,2200,1);`);
      const sql = queries().combinedSql!;
      const combined = db.prepare(sql).get()!;
      const moves = JSON.parse(String(combined.movesJson)) as Array<{ games: number }>;
      const recent = JSON.parse(String(combined.recentGamesJson)) as Array<{ gameId: string }>;
      expect(moves.reduce((total, move) => total + move.games, 0)).toBe(14);
      expect(recent).toHaveLength(8);
      expect(recent[0]?.gameId).toBe("blitz2");
      expect(new Set(recent.map((game) => game.gameId)).size).toBe(8);
      const plan = db.prepare("explain query plan " + sql).all();
      expect(
        plan.filter((row) => String(row.detail).includes("USING INDEX raw_lookup")),
      ).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it("preserves speed filters, empty dates, and date-filtered raw fallback", () => {
    const db = setup();
    try {
      expect(db.prepare(queries({ speeds: [0] }).movesSql).all()[0]?.games).toBe(12);
      expect(db.prepare(queries({ speeds: [1] }).movesSql).all()[0]?.games).toBe(1177);
      expect(db.prepare(queries({ speeds: [2] }).movesSql).all()).toEqual([]);
      const feb = queries({ startDate: 20250201, endDate: 20250228 });
      expect(db.prepare(feb.movesSql).all()[0]?.games).toBe(12);
      expect(db.prepare(feb.gamesSql).all()).toHaveLength(8);
      const future = queries({ startDate: 20260301 });
      expect(db.prepare(future.movesSql).all()).toEqual([]);
      expect(db.prepare(future.gamesSql).all()).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("does not read raw games for a covered speed, even if it has raw duplicates", () => {
    const db = setup();
    try {
      db.exec(`insert into opening_position_games values
        (1,X'${keyHex}',1,'d2d4','duplicate',1000,20250101,1,2,2000,2000,1);`);
      expect(db.prepare(queries({ speeds: [1] }).movesSql).all()).toHaveLength(1);
      expect(
        db
          .prepare(queries({ speeds: [1] }).gamesSql)
          .all()
          .map((r) => r.gameId),
      ).toEqual(["blitz"]);
    } finally {
      db.close();
    }
  });
  it("preserves query results and recent-entry index lookups through normalized views", () => {
    const db = setup();
    try {
      db.exec(`insert into opening_position_games values
        (1,X'${keyHex}',0,'e2e4','null-rating',200,20250202,1,2,null,2200,1),
        (1,X'${keyHex}',0,'e2e4','conflicting',201,20250202,1,2,1800,2200,1),
        (2,X'${keyHex}',0,'e2e4','conflicting',201,20250202,1,2,null,2100,1);`);
      const cases = [
        queries(),
        queries({ speeds: [0] }),
        queries({ speeds: [1] }),
        queries({ startDate: 20250201, endDate: 20250228 }),
        queries({ startDate: 20260301 }),
      ];
      const read = () =>
        cases.map(({ movesSql, gamesSql, combinedSql }) => {
          const moves = db.prepare(movesSql).all();
          const games = db.prepare(gamesSql).all();
          const combined = db.prepare(combinedSql!).get()!;
          expect(JSON.parse(String(combined.movesJson))).toEqual(moves);
          expect(JSON.parse(String(combined.recentGamesJson))).toEqual(games);
          return { moves, games };
        });
      const before = read();
      // Representative fixture for the published view contract, not a database migration.
      db.exec(`
        alter table opening_position_games rename to old_games;
        alter table opening_position_recent_games rename to old_recent;
        create table opening_game_metadata (
          metadata_id integer primary key, played_on int, white_id int, black_id int,
          white_rating int, black_rating int, winner int
        );
        insert into opening_game_metadata(played_on,white_id,black_id,white_rating,black_rating,winner)
          select played_on,white_id,black_id,white_rating,black_rating,winner from old_games
          union select played_on,white_id,black_id,white_rating,black_rating,winner from old_recent;
      `);
      for (const [entries, view, source] of [
        ["opening_position_entries", "opening_position_games", "old_games"],
        ["opening_position_recent_entries", "opening_position_recent_games", "old_recent"],
      ]) {
        db.exec(`
          create table ${entries} as
            select g.canonical_player_id,g.position_key,g.speed,g.next_uci,g.game_id,
              g.played_at,m.metadata_id
            from ${source} g join opening_game_metadata m
              on m.played_on is g.played_on and m.white_id is g.white_id
              and m.black_id is g.black_id and m.white_rating is g.white_rating
              and m.black_rating is g.black_rating and m.winner is g.winner;
          create index ${entries}_lookup on ${entries}(position_key,speed,played_at desc);
          create view ${view} as
            select e.canonical_player_id,e.position_key,e.speed,e.next_uci,e.game_id,e.played_at,
              m.played_on,m.white_id,m.black_id,m.white_rating,m.black_rating,m.winner
            from ${entries} e join opening_game_metadata m on m.metadata_id=e.metadata_id;
        `);
      }
      expect(read()).toEqual(before);
      const plan = db.prepare("explain query plan " + queries().gamesSql).all();
      expect(
        plan.some(
          (row) =>
            String(row.detail).includes("opening_position_recent_entries_lookup") &&
            String(row.detail).includes("position_key=? AND speed=?"),
        ),
      ).toBe(true);
    } finally {
      db.close();
    }
  });
});
