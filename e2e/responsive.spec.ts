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

test("puzzle solver keeps its primary controls within the mobile viewport", async ({ page }) => {
  await page.goto("/solve/101");
  await expect(page.locator(".cg-board")).toBeVisible();
  await expect(page.getByLabel("Puzzle navigation").last()).toBeVisible();
  await expect(page.getByLabel("Puzzle 101", { exact: true })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});

test("a solved puzzle keeps its number and navigation in view on a narrow phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route("**/api/puzzles/progress", (route) =>
    route.fulfill({
      json: {
        runId: null,
        graded: false,
        availableAt: "2099-01-01T00:00:00Z",
        permanent: false,
        hasAttempted: true,
        hasSolved: true,
        misses: 0,
        color: "green",
      },
    }),
  );

  await page.goto("/solve/101");
  await expect(page.locator(".mobileWorkflowPanel")).toBeVisible();
  await expect(page.getByLabel("Puzzle 101", { exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel("Puzzle navigation").last()).toBeInViewport({ ratio: 1 });
});

test("landscape phone layout keeps the board and controls in view", async ({ page }) => {
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto("/solve/101");

  await expect(page.locator(".cg-board")).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel("Puzzle navigation").last()).toBeInViewport({ ratio: 1 });
});
