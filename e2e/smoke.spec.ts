import { expect, test } from "./fixtures";

const pages = [
  {
    path: "/",
    heading: "Atomic chess puzzles, rankings, and matches",
  },
  { path: "/solve/101", heading: "Puzzle 101" },
  { path: "/recent", heading: "Game Search" },
  { path: "/dashboard", heading: "My Puzzle Dashboard" },
] as const;

for (const appPage of pages) {
  test(`${appPage.path} renders its primary landmark`, async ({ page }) => {
    await page.goto(appPage.path);

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
  await expect(page.getByRole("heading", { level: 1, name: "Game Search" })).toBeVisible();
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

test("endgame selection survives refresh and browser history", async ({ page }) => {
  await page.route("https://tablebase.lichess.ovh/**", (route) => route.abort());
  await page.goto("/puzzles/endgames?mode=rook-bishop-vs-king");
  const selector = page.getByRole("combobox", { name: "Endgame", exact: true });
  await expect(selector).toHaveValue("rook-bishop-vs-king");
  await selector.selectOption("two-queens");
  await expect(page).toHaveURL(/mode=two-queens/);
  await page.reload();
  await expect(selector).toHaveValue("two-queens");
  await page.goBack();
  await expect(selector).toHaveValue("rook-bishop-vs-king");
  await page.goForward();
  await expect(selector).toHaveValue("two-queens");
});
