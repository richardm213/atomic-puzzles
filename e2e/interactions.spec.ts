import { expect, test } from "./fixtures";

test("bracket dates default off, persist when enabled, and never hide upcoming schedules", async ({
  page,
}) => {
  await page.route("**/rest/v1/tournament_matches?**", (route) =>
    route.fulfill({
      json: [
        {
          id: "played-semi",
          tournament: "awc2026",
          bracket: "main",
          round: "Semifinals",
          order: 1,
          p1: "alpha",
          p2: "beta",
          s1: 6,
          s2: 2,
          played_on: "2026-10-15",
        },
        {
          id: "scheduled-semi",
          tournament: "awc2026",
          bracket: "main",
          round: "Semifinals",
          order: 2,
          p1: "gamma",
          p2: "delta",
          s1: 0,
          s2: 0,
          scheduled_at: "2099-11-08T19:00:00Z",
        },
      ],
    }),
  );
  await page.goto("/tournaments/awc2026");
  const setting = page.getByRole("checkbox", { name: "Show dates" });
  const playedDate = page.locator('time[datetime="2026-10-15"]');
  const schedule = page.locator('time[datetime="2099-11-08T19:00:00Z"]');
  await expect(setting).not.toBeChecked();
  await expect(playedDate).toHaveCount(0);
  await expect(schedule).toBeVisible();
  await setting.check();
  await expect(playedDate).toBeVisible();
  await page.reload();
  await expect(setting).toBeChecked();
  await expect(playedDate).toBeVisible();
  await setting.uncheck();
  await expect(playedDate).toHaveCount(0);
  await expect(schedule).toBeVisible();
});

test("head-to-head search encodes both players in the route", async ({ page }) => {
  await page.goto("/h2h");
  await page.getByLabel("Player 1").fill("Alpha_Player");
  await page.getByLabel("Player 2").fill("Beta_Player");
  await page.getByRole("button", { name: "Compare" }).click();

  await expect(page).toHaveURL(/\/h2h\/alpha_player-vs-beta_player$/);
});

test("puzzle next and previous controls update the route", async ({ page }) => {
  await page.goto("/solve/101");

  const previous = page.getByRole("button", { name: /Previous/ }).first();
  const next = page.getByRole("button", { name: /Next/ }).first();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();

  await next.click();
  await expect(page).toHaveURL(/\/solve\/102$/);
  await expect(page.getByRole("button", { name: /Previous/ }).first()).toBeEnabled();
});
