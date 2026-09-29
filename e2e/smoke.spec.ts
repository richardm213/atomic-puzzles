import { expect, test } from "./fixtures";

const pages = [
  {
    path: "/",
    title: /Puzzles, Rankings & Matches/,
    heading: "Atomic chess puzzles, rankings, and matches",
  },
  { path: "/solve/101", title: /Puzzle #101/, heading: "Puzzle 101" },
  { path: "/recent", title: /Recent Match Archive/, heading: "Recent Match Archive" },
  { path: "/dashboard", title: /Puzzle Dashboard/, heading: "My Puzzle Dashboard" },
] as const;

for (const appPage of pages) {
  test(`${appPage.path} renders its primary landmark`, async ({ page }) => {
    await page.goto(appPage.path);

    await expect(page).toHaveTitle(appPage.title);
    await expect(page.locator("#main-content")).toBeVisible();
    if ("visuallyHiddenHeading" in appPage && appPage.visuallyHiddenHeading) {
      await expect(page.locator("h1", { hasText: appPage.heading })).toBeAttached();
    } else {
      await expect(page.getByRole("heading", { level: 1, name: appPage.heading })).toBeVisible();
    }
  });
}

test("legacy matches route redirects to the recent archive", async ({ page }) => {
  await page.goto("/matches");
  await expect(page).toHaveURL(/\/recent$/);
  await expect(page.getByRole("heading", { level: 1, name: "Recent Match Archive" })).toBeVisible();
});

test("legacy puzzle history route redirects to the dashboard", async ({ page }) => {
  await page.goto("/solve/history");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "My Puzzle Dashboard" })).toBeVisible();
});

test("community root redirects to puzzle rankings", async ({ page }) => {
  await page.goto("/community");
  await expect(page).toHaveURL(/\/community\/puzzles$/);
});
