import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadSupabaseRowsMock } = vi.hoisted(() => ({
  loadSupabaseRowsMock: vi.fn(),
}));

const query = {
  select: vi.fn(() => query),
  in: vi.fn(() => query),
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
  getProfileRankingMonthKey,
  getPublishedProfileRankingTrophies,
  getPuzzleRankingTrophies,
  getPuzzleRankingTrophy,
  type ProfileTrophy,
  sortProfileTrophies,
} from "./profileTrophies";

describe("championship profile trophies", () => {
  beforeEach(() => {
    loadSupabaseRowsMock.mockReset();
    query.in.mockClear();
  });

  it("maps championship rows from Supabase", async () => {
    loadSupabaseRowsMock.mockResolvedValue([
      {
        award_key: "awc-2020",
        label: "AWC 2020",
        title: "AWC 2020 title",
        asset_path: "/images/awc-trophies/awc.png",
        href: "/tournaments/awc2020",
        date_label: "Dec 2020",
        date_value: "2020-12-01",
        placement_label: "Champion",
        prestige: 1000,
      },
    ]);

    await expect(fetchChampionshipTrophies(["Arka50", "ARKA_ALT", "arka50"])).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "awc-2020",
          href: "/tournaments/awc2020",
          prestige: 1000,
        }),
      ]),
    );
    expect(query.in).toHaveBeenCalledWith("player_name", ["arka50", "arka_alt"]);
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

describe("profile trophy sorting", () => {
  it("orders the trophy case from oldest to newest when sorting by date", () => {
    const trophies = [
      trophy("bullet-aug", 900, "Aug 2026", "2026-08-01"),
      trophy("blitz-jun", 900, "Jun 2026", "2026-06-01"),
      trophy("hyper-jul", 900, "Jul 2026", "2026-07-01"),
    ];

    expect(sortProfileTrophies(trophies, "date").map(({ key }) => key)).toEqual([
      "blitz-jun",
      "hyper-jul",
      "bullet-aug",
    ]);
  });
});

describe("profile header trophies", () => {
  it("keeps the previous month's trophies through the first three UTC days", () => {
    expect(getProfileRankingMonthKey(new Date("2027-01-03T23:59:59.999Z"))).toBe("Dec 2026");
    expect(getProfileRankingMonthKey(new Date("2027-01-04T00:00:00.000Z"))).toBe("Jan 2027");
  });

  it("withholds the new month's ranking trophies until the UTC grace period ends", () => {
    const rankingTrophies = [
      trophy("dec-rank", 900, "Dec 2026", "2026-12-01"),
      trophy("jan-rank", 900, "Jan 2027", "2027-01-01"),
    ];

    expect(
      getPublishedProfileRankingTrophies(
        rankingTrophies,
        "Jan 2027",
        getProfileRankingMonthKey(new Date("2027-01-03T23:59:59.999Z")),
      ).map(({ key }) => key),
    ).toEqual(["dec-rank"]);
    expect(
      getPublishedProfileRankingTrophies(
        rankingTrophies,
        "Jan 2027",
        getProfileRankingMonthKey(new Date("2027-01-04T00:00:00.000Z")),
      ).map(({ key }) => key),
    ).toEqual(["dec-rank", "jan-rank"]);
  });

  it("shows every championship and current ranking trophy", () => {
    const visible = getProfileHeaderTrophies({
      championshipTrophies: [
        trophy("chesscom-2025", 980, "Mar 2025", "2025-03-01"),
        trophy("aoc-2026", 970, "Jul 2026", "2026-07-31"),
      ],
      rankingTrophies: [trophy("blitz-rank", 900), trophy("hyper-rank", 800)],
      currentMonthKey: "Aug 2026",
    });

    expect(visible.map(({ key }) => key)).toEqual([
      "chesscom-2025",
      "aoc-2026",
      "blitz-rank",
      "hyper-rank",
    ]);
  });

  it("orders championships from oldest to newest regardless of prestige", () => {
    const visible = getProfileHeaderTrophies({
      championshipTrophies: [
        trophy("awc-2024", 1000, "Dec 2024", "2024-12-01"),
        trophy("aoc-2026", 970, "Jul 2026", "2026-07-31"),
      ],
      rankingTrophies: [trophy("hyper-rank", 800)],
      currentMonthKey: "Aug 2026",
    });

    expect(visible.map(({ key }) => key)).toEqual(["awc-2024", "aoc-2026", "hyper-rank"]);
  });

  it("places ACL Season 1 before Season 2 and later 2026 trophies", () => {
    const visible = getProfileHeaderTrophies({
      championshipTrophies: [
        trophy("atomic-hyper-2026", 970, "Aug 2026", "2026-08-19"),
        trophy("acl-s2", 960, "Mar 2026", "2026-03-29"),
        trophy("acl-s1", 960, "Aug 2025", "2025-08-30"),
      ],
      rankingTrophies: [trophy("bullet-rank", 900, "Sep 2026", "2026-09-01")],
      currentMonthKey: "Sep 2026",
    });

    expect(visible.map(({ key }) => key)).toEqual([
      "acl-s1",
      "acl-s2",
      "atomic-hyper-2026",
      "bullet-rank",
    ]);
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

describe("puzzle ranking trophies", () => {
  it("adds the current eligible puzzle trophy to the existing trophy system", () => {
    expect(
      getPuzzleRankingTrophy(
        {
          username: "solver",
          rating: 2300,
          ratingDeviation: 45,
          attempted: 24,
          correct: 18,
          incorrect: 6,
          percentCorrect: 75,
          eligible: true,
          rank: 2,
        },
        "2026-09",
      ),
    ).toEqual([
      expect.objectContaining({
        key: "puzzles-2026-09-top2",
        label: "Puzzles",
        placementLabel: "2nd place",
        href: "/rankings/puzzles",
      }),
    ]);
  });

  it("does not award an ineligible or outside-top-10 player", () => {
    const row = {
      username: "solver",
      rating: 2300,
      ratingDeviation: 45,
      attempted: 24,
      correct: 18,
      incorrect: 6,
      percentCorrect: 75,
      eligible: false,
      rank: 2,
    };
    expect(getPuzzleRankingTrophy(row, "2026-09")).toEqual([]);
    expect(getPuzzleRankingTrophy({ ...row, eligible: true, rank: 11 }, "2026-09")).toEqual([]);
  });

  it("includes past months and keeps the best linked account for each month", () => {
    const row = (username: string, month: string, rank: number) => ({
      username,
      month,
      rank,
      eligible: true as const,
      rating: 2300,
      ratingDeviation: 45,
      attempted: 24,
      correct: 18,
    });

    const trophies = getPuzzleRankingTrophies(
      [
        row("solver", "2026-08", 7),
        row("solver_alias", "2026-08", 2),
        row("solver", "2026-09", 1),
        row("someone_else", "2026-07", 1),
      ],
      ["solver", "solver_alias"],
    );

    expect(trophies.map(({ key }) => key)).toEqual([
      "puzzles-2026-08-top2",
      "puzzles-2026-09-top1",
    ]);
  });
});
