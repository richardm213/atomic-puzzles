import { expect, test } from "./fixtures";

test("mobile navigation opens and reaches rankings", async ({ page }) => {
  await page.goto("/");

  const menuButton = page.locator(".mobileMenuButton");
  await expect(menuButton).toBeVisible();
  await expect(menuButton).toHaveAccessibleName("Open navigation menu");
  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(menuButton).toHaveAccessibleName("Close navigation menu");
  await page.getByRole("button", { name: "Rankings", exact: true }).click();
  await page.getByRole("menuitem", { name: "Monthly rankings", exact: true }).click();
  await expect(page).toHaveURL(/\/rankings/);
});

test("home page does not overflow a mobile viewport", async ({ page }) => {
  await page.goto("/");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});

test("puzzle solver keeps its primary controls within the mobile viewport", async ({ page }) => {
  await page.goto("/solve/101");
  await expect(page.locator(".cg-board")).toBeVisible();
  await expect(page.getByLabel("Puzzle navigation").last()).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});

test("puzzle solver uses the compact mobile layout on a wide phone in landscape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto("/solve/101");
  await expect(page.locator(".cg-board")).toBeVisible();
  await expect(page.locator(".mobilePuzzleStatus")).toBeVisible();
  await expect(page.getByLabel("Puzzle navigation").last()).toBeVisible();

  const layout = await page.evaluate(() => {
    const board = document.querySelector(".boardFrame")?.getBoundingClientRect();
    const controls = document.querySelector(".mobileBottomNav")?.getBoundingClientRect();
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      boardRight: board?.right ?? 0,
      controlsLeft: controls?.left ?? 0,
      controlsRight: controls?.right ?? Number.POSITIVE_INFINITY,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.controlsLeft).toBeGreaterThanOrEqual(layout.boardRight);
  expect(layout.controlsRight).toBeLessThanOrEqual(layout.clientWidth);
});

for (const path of ["/analysis", "/practice"] as const) {
  test(`${path} light mode stays within the mobile viewport`, async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("atomic-puzzles.theme", JSON.stringify("light"));
    });
    await page.goto(path);
    await expect(page.locator(".cg-board")).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  });
}
