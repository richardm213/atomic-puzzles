import { describe, expect, it } from "vitest";

import { buildAliasIdentityRowsFromArchiveRows } from "./aliases";

describe("buildAliasIdentityRowsFromArchiveRows", () => {
  it("groups archive alias rows by canonical user", () => {
    const rows = buildAliasIdentityRowsFromArchiveRows([
      {
        alias: "Grevozin",
        username: "wolfram_ep",
        banned: false,
        count_games: "c",
        openings: "{variety}",
      },
      {
        alias: "wolfram_ep",
        username: "wolfram_ep",
        banned: false,
        count_games: "o",
        openings: '{"nh3 d4","Nf3 E4"}',
      },
      {
        alias: "drunk_ep",
        username: "wolfram_ep",
        banned: false,
        count_games: "n",
        openings: "{}",
      },
      {
        alias: "banned_ep",
        username: "wolfram_ep",
        banned: true,
        count_games: "y",
        openings: "{ignored}",
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      username: "wolfram_ep",
      aliases: ["grevozin", "drunk_ep"],
      openings: ["variety", "nh3 d4", "nf3 e4"],
      banned: false,
    });
    expect(rows[0]?.accounts).toEqual([
      {
        alias: "grevozin",
        displayAlias: "grevozin",
        source: "chesscom",
        isCounted: true,
        banned: false,
      },
      {
        alias: "wolfram_ep",
        displayAlias: "wolfram_ep",
        source: "lichess",
        isCounted: true,
        banned: false,
      },
      {
        alias: "wolfram_ep",
        displayAlias: "wolfram_ep",
        source: "chesscom",
        isCounted: true,
        banned: false,
      },
      {
        alias: "drunk_ep",
        displayAlias: "drunk_ep",
        source: "lichess",
        isCounted: false,
        banned: false,
      },
      {
        alias: "banned_ep",
        displayAlias: "banned_ep",
        source: "lichess",
        isCounted: true,
        banned: true,
      },
    ]);
  });

  it("marks an identity banned when the canonical account is banned", () => {
    const rows = buildAliasIdentityRowsFromArchiveRows([
      {
        alias: "densef0g",
        username: "densef0g",
        banned: true,
        count_games: "n",
        openings: "{}",
      },
      {
        alias: "dense_alt",
        username: "densef0g",
        banned: false,
        count_games: "y",
        openings: "{}",
      },
    ]);

    expect(rows[0]?.banned).toBe(true);
    expect(rows[0]?.aliases).toEqual(["dense_alt"]);
    expect(rows[0]?.accounts.find((account) => account.alias === "densef0g")?.banned).toBe(true);
  });
});
