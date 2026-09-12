import { expect, test } from "./fixtures";

test("home calls to action navigate without a document reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Solve puzzles", exact: true }).click();

  await expect(page).toHaveURL(/\/solve$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Solve the Atomic Tactic" }),
  ).toBeVisible();
});

test("desktop puzzle menu exposes its destinations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Puzzles" }).hover();

  const menu = page.getByRole("menu", { name: "Puzzles navigation" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(6);
  await menu.getByRole("menuitem", { name: "Puzzle sets" }).click();
  await expect(page).toHaveURL(/\/solve\/sets$/);
});

test("brand link returns to the home page", async ({ page }) => {
  await page.goto("/h2h");
  await page.getByRole("link", { name: "Go to Atomic Puzzles home page" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Atomic chess puzzles, rankings, and matches",
  );
});

test("skip link moves keyboard focus to main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");

  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("current page is exposed to assistive technology", async ({ page }) => {
  await page.goto("/rankings");

  await expect(page.getByRole("link", { name: "Rankings", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("tournament archive cards open a bracket", async ({ page }) => {
  await page.goto("/tournaments");
  await page
    .getByRole("link", { name: /^Open .* bracket$/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/tournaments\/[a-z0-9-]+$/);
  await expect(page.getByRole("main")).toBeVisible();
});

for (const width of [1280, 390]) {
  test(`tournaments is a separate navigation tab at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    if (width < 700) {
      await page.getByRole("button", { name: "Open navigation menu" }).click();
    }
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    const tournaments = nav.getByRole("link", { name: "Tournaments", exact: true });
    await expect(tournaments).toBeVisible();
    await tournaments.click();
    await expect(page).toHaveURL(/\/tournaments$/);
    if (width < 700) {
      await page.getByRole("button", { name: "Open navigation menu" }).click();
    }
    await expect(tournaments).toHaveAttribute("aria-current", "page");
    const games = nav.getByRole("button", { name: "Games", exact: true });
    await expect(games).not.toHaveAttribute("aria-current", "page");
    await games.click();
    const menu = page.getByRole("menu", { name: "Games navigation" });
    await expect(menu.getByRole("menuitem")).toHaveCount(2);
    await expect(menu.getByRole("menuitem", { name: "Tournaments" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
