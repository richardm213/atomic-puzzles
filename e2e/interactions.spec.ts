import { expect, test } from "./fixtures";

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
