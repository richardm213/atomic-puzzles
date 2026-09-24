import { describe, expect, it } from "vitest";

import {
  formatWolfarenaPoints,
  type WolfarenaRound,
  wolfarenaRoundSourceUrl,
  type WolfarenaTournament,
} from "./wolfarena";
import { parseWolfarenaTournament } from "./wolfarenaQueries";

const rounds = Array.from({ length: 18 }, (_, index) => ({
  number: index + 1,
  date: "2026-07-12",
  kind: "Principal" as const,
  sourcePostId: "fRQNJQVz",
  matches: [],
  standings: [],
}));

const tournament: WolfarenaTournament = {
  id: "wr-arena2026",
  title: "Wolfarena 2026",
  champion: "quasabianth",
  sourceUrl: "https://lichess.org/forum/team-wolfrandom-atomic-game/wolfarena-2026-results",
  logUrl: "https://lichess.org/forum/team-wolfrandom-atomic-game/wolfarena-2026-log",
  rounds,
};

describe("Wolfarena archive data", () => {
  it("accepts the complete Supabase payload", () => {
    expect(parseWolfarenaTournament(tournament)).toBe(tournament);
  });

  it("rejects missing or incomplete payloads", () => {
    expect(() => parseWolfarenaTournament(null)).toThrow("payload is missing");
    expect(() => parseWolfarenaTournament({ ...tournament, rounds: rounds.slice(1) })).toThrow(
      "payload is invalid",
    );
  });

  it("formats points and source links consistently", () => {
    expect(formatWolfarenaPoints(8)).toBe("8.0");
    expect(wolfarenaRoundSourceUrl(tournament, rounds[0] as WolfarenaRound)).toBe(
      "https://lichess.org/forum/team-wolfrandom-atomic-game/wolfarena-2026-log#fRQNJQVz",
    );
  });
});
