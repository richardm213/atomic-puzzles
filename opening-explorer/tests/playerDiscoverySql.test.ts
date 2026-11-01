import { describe, expect, it } from "vitest";

import {
  buildOpeningPlayersSql,
  buildRandomOpeningPlayerSql,
  positionKeyHex,
} from "../core/sql.js";

describe("opening explorer player discovery SQL", () => {
  it.each([buildOpeningPlayersSql, buildRandomOpeningPlayerSql])(
    "uses the packed index player directory instead of scanning monthly payloads",
    (buildSql) => {
      const sql = buildSql();

      expect(sql).toContain("from opening_players p");
      expect(sql).not.toContain("player_month");
    },
  );

  it("uses the index's first-four-FEN-fields position format", () => {
    const position = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    expect(positionKeyHex(`${position} 0 1`)).toBe(positionKeyHex(`${position} 87 42`));
    expect(positionKeyHex(`${position} 0 1`)).toBe("95d16ff086549d6cede21ad4");
    expect(positionKeyHex(`${position} 0 1`)).toHaveLength(24);
  });

  it("randomizes only within the player directory", () => {
    const sql = buildRandomOpeningPlayerSql();

    expect(sql.indexOf("from opening_players")).toBeLessThan(sql.indexOf("order by random()"));
  });
});
