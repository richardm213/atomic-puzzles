import { describe, expect, it } from "vitest";

import {
  getTournamentChampion,
  getTournamentDecisiveMatch,
  type TournamentMatch,
} from "./tournaments";

const match = (overrides: Partial<TournamentMatch>): TournamentMatch => ({
  tournament: "test",
  bracket: "main",
  round: "Round",
  order: 1,
  id: "match",
  match_id: "",
  p1: "alpha",
  p2: "beta",
  s1: 1,
  s2: 0,
  winner_to: "",
  loser_to: "",
  ...overrides,
});

describe("tournament decisive match helpers", () => {
  it("uses a completed grand final reset as the decisive match", () => {
    const decisiveMatch = getTournamentDecisiveMatch({
      matches: [
        match({
          bracket: "grand_final",
          round: "Set 1",
          id: "grand-final-set-1",
          s1: 4.5,
          s2: 5.5,
        }),
        match({
          bracket: "grand_final",
          round: "Reset",
          id: "grand-final-reset",
          s1: 5.5,
          s2: 4.5,
        }),
      ],
    });

    expect(decisiveMatch?.id).toBe("grand-final-reset");
  });

  it("uses a grand final set when no completed reset exists", () => {
    const decisiveMatch = getTournamentDecisiveMatch({
      matches: [
        match({
          bracket: "grand_final",
          round: "Set 1",
          id: "grand-final-set-1",
          s1: 5.5,
          s2: 4.5,
        }),
        match({
          bracket: "grand_final",
          round: "Reset",
          id: "grand-final-reset",
          s1: 0,
          s2: 0,
        }),
      ],
    });

    expect(decisiveMatch?.id).toBe("grand-final-set-1");
  });

  it("supports older tournaments with grand finals in the main bracket", () => {
    const bracket = {
      matches: [
        match({
          bracket: "main",
          round: "Finals",
          id: "winners-final",
          p1: "alpha",
          p2: "beta",
          s1: 3,
          s2: 6,
        }),
        match({
          bracket: "main",
          round: "Grand Final",
          id: "grand-final",
          p1: "gamma",
          p2: "beta",
          s1: 6,
          s2: 4,
        }),
      ],
    };

    expect(getTournamentDecisiveMatch(bracket)?.id).toBe("grand-final");
    expect(getTournamentChampion(bracket)).toBe("gamma");
  });
});
