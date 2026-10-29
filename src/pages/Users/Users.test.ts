import { describe, expect, it } from "vitest";

import type { PlayerRatingRow } from "../../lib/archive/types";
import type { AliasLookup, AliasLookupEntry } from "../../lib/users/aliasesLookup";
import { buildUserRows } from "./Users";

const aliasEntry = (
  flags: Partial<Pick<AliasLookupEntry, "banned" | "bot">>,
): AliasLookupEntry => ({
  primary: "",
  aliases: [],
  chessComAliases: [],
  pyChessAliases: [],
  openings: [],
  banned: false,
  bot: false,
  ...flags,
});

const ratingRow = (username: string, rating: number, peak: number): PlayerRatingRow => ({
  username,
  rating,
  peak,
  peak_date: "2026-10-01",
  rd: 45,
  games: 20,
  tc: "blitz",
  rank: username === "normal" ? 1 : 0,
  top20_wins: null,
});

describe("player directory rating visibility", () => {
  it("hides current and peak estimates for bots and cheaters while retaining normal ratings", () => {
    const aliases: AliasLookup = new Map([
      ["normal", aliasEntry({})],
      ["cheater", aliasEntry({ banned: true })],
      ["bot", aliasEntry({ bot: true })],
    ]);

    const rows = buildUserRows(
      [
        ratingRow("normal", 2100, 2200),
        ratingRow("cheater", 2300, 2400),
        ratingRow("bot", 2000, 2050),
      ],
      aliases,
    );

    expect(rows.find((row) => row.username === "normal")?.blitz).toMatchObject({
      current: { display: 2100, sortValue: 2100 },
      peak: { display: 2200, sortValue: 2200 },
    });
    for (const username of ["cheater", "bot"]) {
      expect(rows.find((row) => row.username === username)?.blitz).toMatchObject({
        current: { display: "?", sortValue: null },
        peak: { display: "?", sortValue: null },
      });
    }
  });
});
