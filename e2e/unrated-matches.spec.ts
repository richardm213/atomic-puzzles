import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const mockUnratedArchive = async (page: Page) => {
  await page.route("**/api/archive-data?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    const resource = params.get("resource");
    if (resource === "aliases") {
      return route.fulfill({
        json: ["alice", "bob"].map((username) => ({
          username,
          alias: username,
          banned: username === "bob",
          count_games: "y",
        })),
      });
    }
    if (resource !== "matches") return route.fulfill({ json: [] });

    const mode = params.get("mode");
    if (mode && mode !== "blitz") {
      return route.fulfill({
        json: { total: 0, rows: [], hasPreviousPage: false, hasNextPage: false },
      });
    }

    expect(params.has("ratingMin")).toBe(false);
    expect(params.has("ratingMax")).toBe(false);
    return route.fulfill({
      json: {
        total: 1,
        hasPreviousPage: false,
        hasNextPage: false,
        rows: [
          {
            match_id: "unrated-match",
            player_1: "alice",
            player_2: "bob",
            start_ts: 1700000000000,
            time_control: "3+0",
            source: "arena",
            tournament_id: null,
            games: ["game1234,w,1,1", "game5678,d,0,2"],
            p1_before_rating: null,
            p1_after_rating: null,
            p1_before_rd: null,
            p1_after_rd: null,
            p2_before_rating: null,
            p2_after_rating: null,
            p2_before_rd: null,
            p2_after_rd: null,
          },
        ],
      },
    });
  });
};

test("recent matches keep unrated and banned states usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockUnratedArchive(page);
  await page.goto("/recent");

  const table = page.locator(".recentMatchTable");
  const row = table.locator("tbody > tr").first();
  await expect(row).toBeVisible();
  await row.getByText("3+0", { exact: true }).click();
  const stats = page.locator(".matchCardPlayerStats");
  await expect(stats.getByText("Unrated", { exact: true })).toHaveCount(2);
  await expect(stats.getByRole("img", { name: "Banned player" })).toHaveCount(1);
  await expect(stats).not.toContainText(/NaN|null|Rating 0|RD 0/);
  await expect(page.getByRole("link", { name: "Open match page in new tab" })).toHaveAttribute(
    "href",
    "/match/unrated-match",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("match detail retains score and game links and hides tournament source metadata", async ({
  page,
}) => {
  await mockUnratedArchive(page);
  await page.goto("/match/unrated-match");

  await expect(page.getByLabel("Score 1.5 to 0.5", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "game1234", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "game5678", exact: true })).toBeVisible();
  const header = page.getByRole("region", { name: "Match result" });
  await expect(header.getByText("arena", { exact: true })).toBeVisible();

  // Site tournament matches are identified by their bracket association even
  // when the archive has no tournament_id.
  await page.route("**/__e2e_supabase/**/tournament_matches?**", (route) =>
    route.fulfill({
      json: [
        {
          tournament: "awc2026",
          bracket: "main",
          round: "Quarterfinals",
          order: 1,
          id: "wb-r2-m1",
          match_id: "unrated-match",
          p1: "alice",
          p2: "bob",
          s1: 1.5,
          s2: 0.5,
        },
      ],
    }),
  );
  await page.reload();
  await expect(header.getByRole("link", { name: /AWC 2026 Quarterfinals/ })).toBeVisible();
  await expect(header.getByText("arena", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "game1234", exact: true })).toBeVisible();
});
