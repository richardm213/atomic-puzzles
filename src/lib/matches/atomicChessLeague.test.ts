import { describe, expect, it } from "vitest";

import { atomicChessLeagueSeasons, getAtomicChessLeagueSeason } from "./atomicChessLeague";

describe("Atomic Chess League archive", () => {
  it("contains both completed seasons and two four-team divisions", () => {
    expect(atomicChessLeagueSeasons.map((season) => season.number)).toEqual([2, 1]);
    atomicChessLeagueSeasons.forEach((season) => {
      expect(season.divisions).toHaveLength(2);
      season.divisions.forEach((division) => {
        expect(division.teams).toHaveLength(4);
        expect(division.teams.map((team) => team.rank)).toEqual([1, 2, 3, 4]);
        division.teams.forEach((team) => expect(team.rounds).toHaveLength(3));
      });
    });
  });

  it("falls back to the latest season", () => {
    expect(getAtomicChessLeagueSeason(99).number).toBe(2);
  });
});
