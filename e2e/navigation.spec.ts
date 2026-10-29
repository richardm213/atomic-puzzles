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

test("player search results remain clickable when pressing a result blurs the input", async ({
  page,
}) => {
  await page.route("**/api/archive-data?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("resource") === "usernames" && url.searchParams.has("query")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ username: "salmon_43" }]),
      });
      return;
    }
    await route.fallback();
  });
  await page.route("**/__e2e_supabase/rest/v1/users**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ username: "salmon_43" }]),
    }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Search player" }).click();
  const searchInput = page.getByRole("searchbox", { name: "Search player username" });
  await searchInput.fill("salmon_43");

  const resultRowLink = page
    .getByRole("link", { name: "Open salmon_43's profile" })
    .first();
  await expect(resultRowLink).toBeVisible();

  // Some browsers leave relatedTarget null when the input blurs during a pointer press.
  await searchInput.evaluate((input) => input.blur());
  await expect(resultRowLink).toBeVisible();
  await resultRowLink.click();
  await expect(page).toHaveURL(/\/@\/salmon_43$/);

  await page.goto("/");
  await page.getByRole("button", { name: "Search player" }).click();
  const reopenedSearchInput = page.getByRole("searchbox", { name: "Search player username" });
  await reopenedSearchInput.fill("salmon_43");
  const puzzleDashboardLink = page.getByRole("link", {
    name: "Open salmon_43's puzzle dashboard",
  });
  await expect(puzzleDashboardLink).toBeVisible();
  await reopenedSearchInput.evaluate((input) => input.blur());
  await puzzleDashboardLink.click();
  await expect(page).toHaveURL(/\/@\/salmon_43\/puzzles$/);
});
