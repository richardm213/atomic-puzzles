import { describe, expect, it } from "vitest";

import { wolfarena2026 } from "../../data/wolfarena2026";
import { formatWolfarenaPoints, type WolfarenaRound, wolfarenaRoundSourceUrl } from "./wolfarena";

const rounds: readonly WolfarenaRound[] = wolfarena2026.rounds;

describe("Wolfarena 2026 archive", () => {
  it("keeps all announced rounds and unique result rows", () => {
    expect(wolfarena2026.rounds).toHaveLength(18);
    const matches = rounds.flatMap((round) => round.matches);
    expect(new Set(matches.map((match) => match.id)).size).toBe(matches.length);
    expect(matches.every((match) => match.status === "bye" || match.player2)).toBe(true);
    expect(
      matches.every(
        (match) => match.status === "bye" || (match.score1 !== null && match.score2 !== null),
      ),
    ).toBe(true);
  });

  it("matches the organizer's published final podium", () => {
    const finalStandings = wolfarena2026.rounds.at(-1)?.standings ?? [];
    expect(finalStandings).toHaveLength(28);
    expect(finalStandings.slice(0, 3)).toMatchObject([
      { rank: 1, player: "Quasabianth", points: 128, rating: 2376 },
      { rank: 2, player: "Wolfram_EP", points: 93, rating: 2406 },
      { rank: 3, player: "RabbieR", points: 83.5, rating: 2252 },
    ]);
  });

  it("only links complete matches resolved in the archive", () => {
    const matches = rounds.flatMap((round) => round.matches);
    expect(matches.filter((match) => match.matchId)).toHaveLength(32);
    expect(matches.filter((match) => match.status === "bye" && match.matchId)).toHaveLength(0);
  });

  it("formats points and source links consistently", () => {
    expect(formatWolfarenaPoints(8)).toBe("8.0");
    expect(wolfarenaRoundSourceUrl(wolfarena2026, wolfarena2026.rounds[0]!)).toBe(
      "https://lichess.org/forum/team-wolfrandom-atomic-game/wolfarena-2026-log#fRQNJQVz",
    );
  });
});
