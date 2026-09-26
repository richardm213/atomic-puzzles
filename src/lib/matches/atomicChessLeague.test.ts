import { describe, expect, it } from "vitest";

import { atomicChessLeagueSeasons, getAtomicChessLeagueSeason } from "./atomicChessLeague";

describe("Atomic Chess League archive", () => {
  it("contains both completed seasons and two four-team divisions", () => {
    expect(atomicChessLeagueSeasons.map((season) => season.number)).toEqual([2, 1]);
    atomicChessLeagueSeasons.forEach((season) => {
      expect(season.divisions).toHaveLength(2);
      season.divisions.forEach((division) => {
        expect(division.teams).toHaveLength(4);
        expect(division.rounds.map((round) => round.number)).toEqual([1, 2, 3]);
        expect(division.teams.map((team) => team.rank)).toEqual([1, 2, 3, 4]);
        division.teams.forEach((team) => {
          expect(team.rounds).toHaveLength(3);
          expect(team.players[0]).toBe(team.captain);
        });
        division.rounds.forEach((round) => {
          expect(round.matchups).toHaveLength(2);
          round.matchups.forEach((matchup) => {
            const expectedBoards = season.number === 2 && division.id === "elite" ? 4 : 5;
            expect(matchup.boards).toHaveLength(season.number === 1 ? 4 : expectedBoards);
            matchup.boards.forEach((board) => {
              if (board.status) return;
              expect(board.matchId).toBeTruthy();
            });
          });
        });
      });
    });
  });

  it("falls back to the latest season", () => {
    expect(getAtomicChessLeagueSeason(99).number).toBe(2);
  });

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
