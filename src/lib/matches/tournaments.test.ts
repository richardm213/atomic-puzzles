import { describe, expect, it } from "vitest";

import {
  addEmptyMainBracketRounds,
  compareTournamentStartDates,
  getTournamentChampion,
  getTournamentDecisiveMatch,
  normalizeTournamentMetaRow,
  type TournamentMatch,
} from "./tournaments";

describe("tournament catalog rows", () => {
  it("normalizes database-backed tournament metadata", () => {
    expect(
      normalizeTournamentMetaRow({
        id: "ahc2026",
        series_key: "ahc",
        series_name: "Atomic Hyper Championship",
        title: "AHC 2026",
        heading_title: "Atomic Hyper Championship 2026",
        year: 2026,
        start_date: "2026-07-10",
        end_date: "2026-08-19",
        status: "available",
        match_mode: "hyperbullet",
        complete_main_bracket_from_round: "Round of 32",
        trophy_asset_path: "/images/awc-trophies/atomic-hyper-championship.png",
        show_champion: true,
        display_order: 30,
        home_feature_order: 20,
      }),
    ).toEqual(
      expect.objectContaining({
        id: "ahc2026",
        seriesKey: "ahc",
        seriesName: "Atomic Hyper Championship",
        startDate: "2026-07-10",
        endDate: "2026-08-19",
        matchMode: "hyperbullet",
        completeMainBracketFromRound: "Round of 32",
        showChampion: true,
        homeFeatureOrder: 20,
      }),
    );
  });

  it("orders tournaments by start date instead of display order", () => {
    const base = {
      seriesKey: "test",
      seriesName: "Test",
      title: "Test",
      status: "available" as const,
      showChampion: false,
      displayOrder: 0,
    };
    const tournaments = [
      { ...base, id: "acl-s1", year: 2025, startDate: "2025-07-01" },
      { ...base, id: "awc2025", year: 2025, startDate: "2025-09-03" },
      { ...base, id: "early-2026", year: 2026, startDate: "2026-02-01" },
    ];

    expect(tournaments.sort(compareTournamentStartDates).map((entry) => entry.id)).toEqual([
      "early-2026",
      "awc2025",
      "acl-s1",
    ]);
  });
});

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

describe("main bracket completion", () => {
  it("preserves sparse match order without duplicating a later reported result", () => {
    const roundOf32 = Array.from({ length: 16 }, (_, index) =>
      match({
        tournament: "ahc2026",
        round: "Round of 32",
        order: index + 1,
        id: `ahc2026-r32-m${index + 1}`,
        p1: `player-${index * 2 + 1}`,
        p2: `player-${index * 2 + 2}`,
        winner_to: "",
      }),
    );
    const reportedRoundOf16 = [
      match({
        tournament: "ahc2026",
        round: "Round of 16",
        order: 1,
        id: "ahc2026-r16-m1",
      }),
      match({
        tournament: "ahc2026",
        round: "Round of 16",
        order: 4,
        id: "ahc2026-r16-m4",
        p1: "sile314",
        p2: "jakestatefarm",
        s1: 1,
        s2: 17,
      }),
    ];

    const completed = addEmptyMainBracketRounds(
      [...roundOf32, ...reportedRoundOf16],
      "Round of 32",
    );
    const roundOf16 = completed
      .filter((candidate) => candidate.round === "Round of 16")
      .sort((left, right) => left.order - right.order);

    expect(roundOf16.map((candidate) => candidate.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(roundOf16.filter((candidate) => candidate.order === 4)).toEqual([
      expect.objectContaining({
        id: "ahc2026-r16-m4",
        p1: "sile314",
        p2: "jakestatefarm",
        s1: 1,
        s2: 17,
      }),
    ]);
    expect(roundOf32[6]?.winner_to).toBe("");
    expect(completed.find((candidate) => candidate.id === "ahc2026-r32-m7")?.winner_to).toBe(
      "ahc2026-r16-m4",
    );
    expect(completed.find((candidate) => candidate.id === "ahc2026-r32-m8")?.winner_to).toBe(
      "ahc2026-r16-m4",
    );
  });
});
