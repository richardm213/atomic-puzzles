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

    expect(params.has("ratingMin")).toBe(false);
    expect(params.has("ratingMax")).toBe(false);
    return route.fulfill({
      json: {
        total: 1,
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

test("profile history presents an unrated match without fake rating values", async ({ page }) => {
  await mockUnratedArchive(page);
  await page.goto("/@/alice/history");

  const table = page.locator(".profileMatchTable");
  const row = table.locator("tbody > tr").first();
  await expect(table.getByText("bob", { exact: true })).toBeVisible();
  await expect(row.locator("td").nth(4)).toBeEmpty();
  await expect(row.locator("td").nth(5)).toBeEmpty();
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(table.getByText("Unrated", { exact: true })).toHaveCount(2);
  await expect(table.getByRole("link", { name: "game1234", exact: true })).toBeVisible();
});

test("recent matches keep unrated and banned states usable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockUnratedArchive(page);
  await page.goto("/recent");

  const card = page.locator(".matchCard").first();
  await expect(card).toBeVisible();
  await card.focus();
  await page.keyboard.press("Enter");
  const stats = page.locator(".matchCardPlayerStats");
  await expect(stats.getByText("Unrated", { exact: true })).toHaveCount(2);
  await expect(stats.getByRole("img", { name: "Banned player" })).toHaveCount(1);
  await expect(stats).not.toContainText(/NaN|null|Rating 0|RD 0/);
  await expect(page.getByRole("link", { name: "Open match page in new tab" })).toHaveAttribute(
    "href",
    "/matches/unrated-match",
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("unrated match detail retains its score and game links", async ({ page }) => {
  await mockUnratedArchive(page);
  await page.goto("/matches/unrated-match");

  await expect(page.getByLabel("Score 1.5 to 0.5", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "game1234", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "game5678", exact: true })).toBeVisible();
});
