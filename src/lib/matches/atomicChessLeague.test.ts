import { describe, expect, it } from "vitest";

import { atomicChessLeagueSeasons } from "./atomicChessLeague";

describe("Atomic Chess League archive", () => {
  it("only links board results that have an archive match id", () => {
    const boards = atomicChessLeagueSeasons.flatMap((season) =>
      season.divisions.flatMap((division) =>
        division.rounds.flatMap((round) => round.matchups.flatMap((matchup) => matchup.boards)),
      ),
    );

    expect(boards.filter((board) => board.status === "unarchived")).toHaveLength(3);
    expect(boards.some((board) => board.matchId?.startsWith("acl-"))).toBe(false);
  });
});
