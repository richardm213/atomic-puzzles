import { describe, expect, it } from "vitest";

import {
  getChampionshipTrophies,
  getProfileHeaderTrophies,
  type ProfileTrophy,
} from "./profileTrophies";

describe("championship profile trophies", () => {
  it("shows the AOC 2026 trophy on JakeStateFarm's profile", () => {
    expect(getChampionshipTrophies("JakeStateFarm")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "atomic-openings-2026",
          href: "/tournaments/aoc2026",
          title: "2026 Atomic Openings Champion",
        }),
      ]),
    );
  });
});

const trophy = (
  key: string,
  prestige: number,
  dateLabel = "Aug 2026",
  dateValue = "2026-08-01",
): ProfileTrophy => ({
  key,
  label: key,
  title: key,
  imageSrc: `/${key}.png`,
  href: `/${key}`,
  dateLabel,
  dateValue,
  placementLabel: "Champion",
  prestige,
});

describe("profile header trophies", () => {
  it("shows the most recent championship when current ranking trophies are available", () => {
    const visible = getProfileHeaderTrophies({
      championshipTrophies: [
        trophy("chesscom-2025", 980, "Mar 2025", "2025-03-01"),
        trophy("aoc-2026", 970, "Jul 2026", "2026-07-31"),
      ],
      rankingTrophies: [trophy("blitz-rank", 900), trophy("hyper-rank", 800)],
      currentMonthKey: "Aug 2026",
    });

    expect(visible.map(({ key }) => key)).toEqual(["aoc-2026", "blitz-rank", "hyper-rank"]);
  });

  it("prioritizes an AWC win over a more recent tournament win", () => {
    const visible = getProfileHeaderTrophies({
      championshipTrophies: [
        trophy("awc-2024", 1000, "Dec 2024", "2024-12-01"),
        trophy("aoc-2026", 970, "Jul 2026", "2026-07-31"),
      ],
      rankingTrophies: [trophy("hyper-rank", 800)],
      currentMonthKey: "Aug 2026",
    });

    expect(visible.map(({ key }) => key)).toEqual(["awc-2024", "hyper-rank"]);
  });

  it("uses additional championships when no current ranking trophies are available", () => {
    const visible = getProfileHeaderTrophies({
      championshipTrophies: [
        trophy("chesscom-2025", 980, "Mar 2025", "2025-03-01"),
        trophy("awc-2024", 1000, "Dec 2024", "2024-12-01"),
        trophy("aoc-2026", 970, "Jul 2026", "2026-07-31"),
      ],
      rankingTrophies: [trophy("old-rank", 900, "Jul 2026")],
      currentMonthKey: "Aug 2026",
    });

    expect(visible.map(({ key }) => key)).toEqual(["awc-2024", "aoc-2026", "chesscom-2025"]);
  });
});
