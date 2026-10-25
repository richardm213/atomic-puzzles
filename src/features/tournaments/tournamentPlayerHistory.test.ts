import { describe, expect, it } from "vitest";

import type { TournamentPlayerAppearance } from "../../lib/matches/tournaments";
import { countTournamentPlayerTitles } from "./tournamentPlayerHistory";

const appearance = (seriesKey: string, placementLabel: string): TournamentPlayerAppearance => ({
  tournament: {
    id: `${seriesKey}-${placementLabel}`,
    seriesKey,
    seriesName: seriesKey,
    title: seriesKey,
    year: 2026,
    status: "available",
    showChampion: true,
    displayOrder: 0,
  },
  placementLabel,
  wins: 0,
  losses: 0,
  draws: 0,
  matches: [],
});

describe("tournament player title counts", () => {
  it("separates ACL team titles from individual first-place finishes", () => {
    expect(
      countTournamentPlayerTitles([
        appearance("acl", "1st"),
        appearance("awc", "Champion"),
        appearance("wr-arena", "1st place"),
        appearance("ahc", "Runner-up"),
      ]),
    ).toEqual({ titles: 2, teamTitles: 1 });
  });
});
