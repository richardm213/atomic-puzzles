import { createRequire } from "node:module";

const { DatabaseSync } = createRequire(import.meta.url)(
  "node:sqlite",
) as typeof import("node:sqlite");

import { describe, expect, it } from "vitest";

import { buildOpeningExplorerSql } from "../core/legacySql.js";

describe("personalized opening explorer SQL", () => {
  it("resolves player aliases inside the combined explorer query", () => {
    const db = new DatabaseSync(":memory:");
    const keyHex = "007a07e2907927020b305efdb129dc37";
    try {
      db.exec(`
        create table opening_names (name_id integer primary key, name text unique);
        create table opening_index_meta (key text primary key, value text);
        create table opening_edges_daily (
          position_key blob, player_color int, speed int, canonical_player_id int,
          played_on int, next_uci text, games int, white_wins int, draws int,
          black_wins int, opponent_rating_sum int
        );
        create table opening_position_games (
          canonical_player_id int, player_color int, position_key blob, speed int,
          next_uci text, game_id text, played_at int, played_on int,
          white_id int, black_id int, white_rating int, black_rating int, winner int
        );
        insert into opening_names values (1,'alice'),(2,'bob');
        insert into opening_index_meta values ('aliases','{"old-alice":"alice"}');
        insert into opening_edges_daily values
          (X'${keyHex}',0,1,1,20261010,'e2e4',2,1,0,1,4000);
        insert into opening_position_games values
          (1,0,X'${keyHex}',1,'e2e4','game-1',100,20261010,1,2,2000,2000,1);
      `);

      const { combinedSql } = buildOpeningExplorerSql({
        keyHex,
        speeds: [1],
        color: 0,
        username: "old-alice",
        opponent: "",
        playerMinRating: 1700,
        startDate: null,
        endDate: null,
      });
      const row = db.prepare(combinedSql!).get()!;

      expect(JSON.parse(String(row.movesJson))).toMatchObject([{ uci: "e2e4", games: 2 }]);
      expect(JSON.parse(String(row.recentGamesJson))).toMatchObject([
        { gameId: "game-1", white: "alice", black: "bob" },
      ]);
    } finally {
      db.close();
    }
  });
});
