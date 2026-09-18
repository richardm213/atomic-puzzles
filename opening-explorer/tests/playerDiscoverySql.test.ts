import { describe, expect, it } from "vitest";

import { buildOpeningPlayersSql, buildRandomOpeningPlayerSql } from "../core/sql.js";

describe("opening explorer player discovery SQL", () => {
  it.each([buildOpeningPlayersSql, buildRandomOpeningPlayerSql])(
    "limits discovery to the indexed standard starting position",
    (buildSql) => {
      const sql = buildSql();

      expect(sql).toContain("position_key = X'b7a79f3545a8954ac7e196720a46ecf7'");
      expect(sql).toContain("select distinct canonical_player_id");
    },
  );

  it("randomizes only after reducing the candidate set", () => {
    const sql = buildRandomOpeningPlayerSql();

    expect(sql.indexOf("position_key =")).toBeLessThan(sql.indexOf("order by random()"));
  });
});
