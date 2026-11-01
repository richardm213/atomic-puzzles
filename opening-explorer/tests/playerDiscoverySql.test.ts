import { describe, expect, it } from "vitest";

import {
  buildOpeningPlayersSql,
  buildRandomOpeningPlayerSql,
  positionKeyHex,
} from "../core/sql.js";

describe("opening explorer player discovery SQL", () => {
  it.each([buildOpeningPlayersSql, buildRandomOpeningPlayerSql])(
    "limits discovery to the indexed standard starting position",
    (buildSql) => {
      const sql = buildSql();

      expect(sql).toContain("position_key = X'95d16ff086549d6cede21ad4502727c6'");
      expect(sql).toContain("select distinct canonical_player_id");
    },
  );

  it("uses the index's first-four-FEN-fields position format", () => {
    const position = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";

    expect(positionKeyHex(`${position} 0 1`)).toBe(positionKeyHex(`${position} 87 42`));
    expect(positionKeyHex(`${position} 0 1`)).toBe("95d16ff086549d6cede21ad4502727c6");
  });

  it("randomizes only after reducing the candidate set", () => {
    const sql = buildRandomOpeningPlayerSql();

    expect(sql.indexOf("position_key =")).toBeLessThan(sql.indexOf("order by random()"));
  });
});
