import { describe, expect, it } from "vitest";

import type { ParsedMatch } from "./data";
import { tournamentGameScore } from "./tournamentGameScore";

const match = (winners: string[]): ParsedMatch => ({
  match_id: "match",
  mode: "blitz",
  players: ["Alice", "Bob"],
  start_ts: 0,
  time_control: "3+2",
  source: "friend",
  tournament_id: "event",
  ratings: {},
  games: winners.map((winner, index) => {
    const white = index % 2 ? "Bob" : "Alice";
    return {
      id: `g${index + 1}`,
      game_index: index + 1,
      white,
      black: white === "Alice" ? "Bob" : "Alice",
      winner: winner === "draw" ? "draw" : winner === white ? "white" : "black",
    };
  }),
});
const result = (s1: number, s2: number) => ({
  p1: "Bob",
  p2: "Alice",
  s1,
  s2,
  outcome_type: "" as const,
});

describe("tournament post-game score", () => {
  it("includes the selected game and draws, regardless of bracket order or piece colors", () => {
    const games = match([
      "Alice",
      "Bob",
      "Alice",
      "Bob",
      "Alice",
      "Bob",
      "Alice",
      "Bob",
      "Alice",
      "draw",
    ]);
    expect(tournamentGameScore(games, "g9", result(4.5, 5.5), 10)).toMatchObject({
      scores: new Map([
        ["alice", 5],
        ["bob", 4],
      ]),
      clinchedBy: null,
    });
    expect(tournamentGameScore(games, "g10", result(4.5, 5.5), 10)).toMatchObject({
      scores: new Map([
        ["alice", 5.5],
        ["bob", 4.5],
      ]),
      clinchedBy: "alice",
    });
  });

  it("highlights the first AWC clinch and the published finish, even when more games were played", () => {
    const games = match([...Array(5).fill("Alice"), "draw", "Bob", "Bob", "Bob", "Alice"]);
    expect(tournamentGameScore(games, "g5", result(3.5, 6.5), 10)?.clinchedBy).toBeNull();
    expect(tournamentGameScore(games, "g6", result(3.5, 6.5), 10)?.clinchedBy).toBe("alice");
    expect(tournamentGameScore(games, "g9", result(3.5, 6.5), 10)?.clinchedBy).toBeNull();
    expect(tournamentGameScore(games, "g10", result(3.5, 6.5), 10)?.clinchedBy).toBe("alice");
  });

  it("waits for a tiebreak pair to finish, including drawn games and either winning player", () => {
    const regulation = Array.from({ length: 5 }, () => ["Alice", "Bob"]).flat();
    for (const [extra, official, winner, clinchingGame] of [
      [["Alice", "Alice", "Bob", "Alice"], result(6, 8), "alice", 12],
      [["Alice", "draw"], result(5.5, 6.5), "alice", 12],
      [["Bob", "Alice", "Bob", "Bob"], result(8, 6), "bob", 14],
    ] as const) {
      const games = match([...regulation, ...extra]);
      const decidingGame = games.games.length;
      expect(
        tournamentGameScore(games, `g${decidingGame - 1}`, official, 10)?.clinchedBy,
      ).toBeNull();
      expect(tournamentGameScore(games, `g${clinchingGame}`, official, 10)?.clinchedBy).toBe(
        winner,
      );
      expect(tournamentGameScore(games, `g${decidingGame}`, official, 10)?.clinchedBy).toBe(winner);
    }
  });

  it("handles early and longer regulation finishes using each event's official score", () => {
    for (const wins of [6, 11]) {
      const games = match(Array(wins).fill("Alice"));
      expect(tournamentGameScore(games, `g${wins - 1}`, result(0, wins))?.clinchedBy).toBeNull();
      expect(tournamentGameScore(games, `g${wins}`, result(0, wins))?.clinchedBy).toBe("alice");
      expect(
        tournamentGameScore(games, `g${wins}`, result(0, wins), (wins - 1) * 2)?.clinchedBy,
      ).toBe("alice");
    }
  });

  it("credits a drawn deciding game only when the official result confirms draw odds", () => {
    const games = match(["Alice", "Bob", "draw"]);
    expect(tournamentGameScore(games, "g3", result(2, 1))).toMatchObject({
      scores: new Map([
        ["alice", 1],
        ["bob", 2],
      ]),
      clinchedBy: "bob",
    });
    expect(tournamentGameScore(games, "g3", result(1.5, 1.5))).toMatchObject({
      scores: new Map([
        ["alice", 1.5],
        ["bob", 1.5],
      ]),
      clinchedBy: null,
    });
  });

  it("shows running scores without inventing a winner for pending, forfeited, or mismatched records", () => {
    const games = match(["Alice", "Bob", "Alice"]);
    expect(tournamentGameScore(games, "g3")?.scores.get("alice")).toBe(2);
    expect(tournamentGameScore(games, "g3", result(0, 0))?.clinchedBy).toBeNull();
    expect(
      tournamentGameScore(games, "g3", { ...result(1, 2), outcome_type: "withdrawal" })?.clinchedBy,
    ).toBeNull();
    expect(tournamentGameScore(games, "missing", result(1, 2))).toBeNull();
  });
});
