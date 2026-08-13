import { expect, test } from "./fixtures";

test("head-to-head search validates missing usernames", async ({ page }) => {
  await page.goto("/h2h");
  await page.getByRole("button", { name: "Search Matchup" }).click();

  await expect(page.getByText("Enter both usernames to search head-to-head.")).toBeVisible();
});

test("head-to-head search encodes both players in the route", async ({ page }) => {
  await page.goto("/h2h");
  await page.getByLabel("Player 1").fill("Alpha_Player");
  await page.getByLabel("Player 2").fill("Beta_Player");
  await page.getByRole("button", { name: "Search Matchup" }).click();

  await expect(page).toHaveURL(/\/h2h\/alpha_player-vs-beta_player$/);
});

test("practice side control exposes and changes the selected side", async ({ page }) => {
  await page.goto("/practice");

  const sideButton = page.getByRole("button", { name: "Play as black" });
  await expect(sideButton).toBeVisible();
  await sideButton.click();
  await expect(page.getByRole("button", { name: "Play as white" })).toBeVisible();
});

test("practice settings expand and collapse", async ({ page }) => {
  await page.goto("/practice");

  const openButton = page.getByRole("button", { name: "Open practice settings" });
  await openButton.click();
  await expect(page.locator("#practice-settings-panel")).toBeVisible();
  await page.getByRole("button", { name: "Close practice settings" }).click();
  await expect(page.locator("#practice-settings-panel")).toBeHidden();
});

test("puzzle route renders deterministic metadata and chessboard", async ({ page }) => {
  await page.goto("/solve/101");

  await expect(page.locator(".cg-board")).toBeVisible();
  await expect(page.getByText("e2e-player", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Browser test set", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Puzzle count").first()).toContainText(/1\s*of\s*2/);
});

test("puzzle next and previous controls update the route", async ({ page }) => {
  await page.goto("/solve/101");

  const previous = page.getByRole("button", { name: /Previous/ }).first();
  const next = page.getByRole("button", { name: /Next/ }).first();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();

  await next.click();
  await expect(page).toHaveURL(/\/solve\/102$/);
  await expect(page.getByLabel("Puzzle count").first()).toContainText(/2\s*of\s*2/);
  await expect(page.getByRole("button", { name: /Previous/ }).first()).toBeEnabled();
});

test("puzzle detail tabs explain why protected details are locked", async ({ page }) => {
  await page.goto("/solve/101");

  const tabList = page.getByRole("tablist", { name: "Puzzle details" });
  const explanationTab = tabList.getByRole("tab", { name: /Explanation/ });
  await expect(explanationTab).toBeDisabled();
  await expect(explanationTab).toHaveAttribute(
    "title",
    "Make a wrong move to unlock the explanation.",
  );
});
