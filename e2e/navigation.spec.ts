import { expect, test } from "./fixtures";

test("desktop puzzle menu exposes its destinations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Puzzles" }).hover();

  const menu = page.getByRole("menu", { name: "Puzzles navigation" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveCount(6);
  await menu.getByRole("menuitem", { name: "Puzzle sets" }).click();
  await expect(page).toHaveURL(/\/solve\/sets$/);
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

  await expect(page.getByRole("button", { name: "Rankings", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
