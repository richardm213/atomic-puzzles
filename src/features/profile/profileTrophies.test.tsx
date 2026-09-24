import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadSupabaseRowsMock } = vi.hoisted(() => ({
  loadSupabaseRowsMock: vi.fn(),
}));

const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  order: vi.fn(() => query),
};

vi.mock("../../lib/supabase/client", () => ({
  getSupabaseClient: () => ({ from: () => query }),
}));

vi.mock("../../lib/supabase/rows", () => ({
  loadSupabaseRows: loadSupabaseRowsMock,
}));

import {
  fetchChampionshipTrophies,
  getProfileHeaderTrophies,
  type ProfileTrophy,
} from "./profileTrophies";

describe("championship profile trophies", () => {
  beforeEach(() => {
    loadSupabaseRowsMock.mockReset();
  });

  it.each([
    ["tipau", "awc-2016", "/tournaments/awc2016"],
    ["Arka50", "awc-2017", "/tournaments/awc2017"],
    ["Arka50", "awc-2018", "/tournaments/awc2018"],
    ["onubense", "awc-2019", "/tournaments/awc2019"],
    ["Arka50", "awc-2020", "/tournaments/awc2020"],
    ["RKROUNIT", "atomic-hyper-2026", "/tournaments/ahc2026"],
    ["JakeStateFarm", "atomic-openings-2026", "/tournaments/aoc2026"],
    ["quasabianth", "wr-arena-2026", "/tournaments/wr-arena2026"],
  ])("loads %s's %s trophy from Supabase", async (username, key, href) => {
    loadSupabaseRowsMock.mockResolvedValue([
      {
        award_key: key,
        label: key,
        title: `${key} title`,
        asset_path: "/images/awc-trophies/awc.png",
        href,
        date_label: "Dec 2020",
        date_value: "2020-12-01",
        placement_label: "Champion",
        prestige: 1000,
      },
    ]);

    await expect(fetchChampionshipTrophies(username)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key,
          href,
          prestige: 1000,
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
  it("shows the highest-prestige championship when current ranking trophies are available", () => {
    const visible = getProfileHeaderTrophies({
      championshipTrophies: [
        trophy("chesscom-2025", 980, "Mar 2025", "2025-03-01"),
        trophy("aoc-2026", 970, "Jul 2026", "2026-07-31"),
      ],
      rankingTrophies: [trophy("blitz-rank", 900), trophy("hyper-rank", 800)],
      currentMonthKey: "Aug 2026",
    });

    expect(visible.map(({ key }) => key)).toEqual(["chesscom-2025", "blitz-rank", "hyper-rank"]);
  });

  it("prioritizes a higher-prestige championship over a more recent one", () => {
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

    expect(visible.map(({ key }) => key)).toEqual(["awc-2024", "chesscom-2025", "aoc-2026"]);
  });
});
