import { expect, test } from "@playwright/test";

const queuePuzzle = {
  id: 901,
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  solution: "1. e4 e5 (1... c5 2. Nf3) 2. Nf3",
  event: "Navigation regression",
  explanation: "",
  submitted_by: "e2e-player",
  created_at: "2026-11-05T00:00:00.000Z",
  next_puzzle_id: 2621,
  white_player: null,
  black_player: null,
  opa_style: false,
};

test("puzzle review returns to the main continuation after backtracking", async ({ page }) => {
  await page.unroute("**/api/auth/session");
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ user: { username: "seaside_tiramisu" } }),
    }),
  );
  await page.route("**/api/puzzles/review", async (route) => {
    const body = route.request().postDataJSON() as { action?: string };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body.action === "list" ? { puzzles: [queuePuzzle] } : {}),
    });
  });

  await page.goto("/puzzles/review");

  const moves = page.getByRole("region", { name: "Solution moves" });
  await expect(moves.getByRole("button", { name: /c5/ })).toBeVisible();
  await moves.getByRole("button", { name: /c5/ }).click();

  for (let repetition = 0; repetition < 3; repetition += 1) {
    await page.keyboard.press("ArrowLeft");
    await expect(moves.getByRole("button", { name: /e4/ })).toHaveAttribute("aria-current", "step");
    await page.keyboard.press("ArrowRight");
    await expect(moves.getByRole("button", { name: /e5/ })).toHaveAttribute("aria-current", "step");
    await expect(moves.getByRole("button", { name: /c5/ })).not.toHaveAttribute(
      "aria-current",
      "step",
    );
  }
});
