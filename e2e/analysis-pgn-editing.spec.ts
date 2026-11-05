import { expect, test } from "@playwright/test";

test("analysis and puzzle PGNs share branch deletion and main-line traversal", async ({ page }) => {
  await page.goto("/analysis");

  const pgn = page.getByRole("textbox", { name: "PGN" });
  await pgn.fill("1. e4 e5 (1... c5 2. Nf3) 2. Nf3");
  await pgn.press("Enter");

  const moves = page.getByRole("list", { name: "Analysis variations" });
  const alternateMove = moves.getByRole("button", { name: /c5/ });
  await expect(alternateMove).toBeVisible();
  await alternateMove.dispatchEvent("contextmenu", { button: 2, clientX: 80, clientY: 80 });
  await page.getByRole("menuitem", { name: "Delete from here" }).click();

  await expect(moves.getByRole("button", { name: /c5/ })).toHaveCount(0);
  await expect(pgn).not.toHaveValue(/c5/);

  const mainLine = page.getByRole("list", { name: "Played moves" });
  for (let repetition = 0; repetition < 3; repetition += 1) {
    await page.keyboard.press("ArrowRight");
    await expect(mainLine.getByRole("button", { name: "e5", exact: true })).toHaveAttribute(
      "aria-current",
      "step",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(mainLine.getByRole("button", { name: "e4", exact: true })).toHaveAttribute(
      "aria-current",
      "step",
    );
  }
});
