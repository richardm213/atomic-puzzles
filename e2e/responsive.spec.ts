import { expect, test } from "./fixtures";

test("mobile navigation opens and reaches rankings", async ({ page }) => {
  await page.goto("/");

  const menuButton = page.locator(".mobileMenuButton");
  await expect(menuButton).toBeVisible();
  await expect(menuButton).toHaveAccessibleName("Open navigation menu");
  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(menuButton).toHaveAccessibleName("Close navigation menu");
  await page.getByRole("link", { name: "Rankings", exact: true }).click();
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
