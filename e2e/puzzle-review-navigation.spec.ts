import { expect, test } from "./fixtures";

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

test("deleting a puzzle variation removes it from backward and forward navigation", async ({
  page,
}) => {
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
  const alternateMove = moves.getByRole("button", { name: /c5/ });
  await expect(alternateMove).toBeVisible();
  await alternateMove.click();
  await alternateMove.click({ button: "right" });
  const deleteMove = page.getByRole("menuitem", { name: "Delete", exact: true });
  await expect(deleteMove).toBeVisible();
  await deleteMove.click();

  await expect(moves.getByRole("button", { name: /c5/ })).toHaveCount(0);

  for (let repetition = 0; repetition < 2; repetition += 1) {
    await page.keyboard.press("ArrowRight");
    await expect(moves.getByRole("button", { name: /e5/ })).toHaveAttribute("aria-current", "step");
    await page.keyboard.press("ArrowLeft");
    await expect(moves.getByRole("button", { name: /e4/ })).toHaveAttribute("aria-current", "step");
  }
});

test("solve-mode arrows replay only played moves until the solution is revealed", async ({
  page,
}) => {
  await page.route("**/api/puzzles/play", (route) =>
    route.fulfill({
      json: {
        puzzles: [
          {
            ...queuePuzzle,
            id: 102,
            fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
            solution: "1... e5 (1... c5 2. Nf3) 2. Nf3 Nc6 3. Bc4 Nf6",
            intro: { beforeFen: queuePuzzle.fen, san: "e4", uci: "e2e4" },
          },
        ],
      },
    }),
  );
  await page.goto("/solve/102");
  const analysis = page.getByRole("region", { name: "Puzzle analysis" });
  const intro = analysis.getByRole("button", { name: "1. e4", exact: true });
  const next = analysis.getByRole("button", { name: "Next move", exact: true });
  const latest = analysis.getByRole("button", { name: "Go to latest move" });
  await expect(intro).toHaveAttribute("aria-current", "step");
  await expect(next).toBeDisabled();
  await expect(latest).toBeDisabled();

  await analysis.getByRole("button", { name: "Previous move", exact: true }).click();
  await expect(intro).not.toHaveAttribute("aria-current");
  await next.click();
  await expect(intro).toHaveAttribute("aria-current", "step");
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(analysis.getByRole("button", { name: /e5|Nf3|Nc6|c5/ })).toHaveCount(0);

  // The solver plays Black; use real Chessground clicks throughout the attempt.
  const playBlackMove = async (uci: string) => {
    const bounds = await page.locator("cg-board").boundingBox();
    if (!bounds) throw new Error("Puzzle board is missing");
    for (const square of [uci.slice(0, 2), uci.slice(2, 4)]) {
      const file = square.charCodeAt(0) - "a".charCodeAt(0);
      const rank = Number(square[1]);
      await page.mouse.click(
        bounds.x + ((7.5 - file) * bounds.width) / 8,
        bounds.y + ((rank - 0.5) * bounds.height) / 8,
      );
    }
  };
  await playBlackMove("e7e5");
  const reply = analysis.getByRole("button", { name: /Nf3/ });
  await expect(reply).toHaveAttribute("aria-current", "step");
  await expect(next).toBeDisabled();
  await expect(latest).toBeDisabled();
  await analysis.getByRole("button", { name: "Previous move", exact: true }).click();
  await expect(analysis.getByRole("button", { name: /e5/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await next.click();
  await expect(reply).toHaveAttribute("aria-current", "step");
  await intro.click();
  await latest.click();
  await expect(reply).toHaveAttribute("aria-current", "step");
  await reply.click();
  await expect(reply).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(analysis.getByRole("button", { name: /Nc6|Bc4|Nf6|c5/ })).toHaveCount(0);
  await expect(reply).toHaveAttribute("aria-current", "step");

  await playBlackMove("a7a6");
  const giveUp = analysis.getByRole("button", { name: "Give up and reveal the solution" });
  await expect(giveUp).toBeVisible();
  // After a wrong move, arrows from inside the move box can replay the
  // played line, but cannot cross into the unrevealed solution.
  const futureMoves = analysis.getByRole("button", { name: /Nc6|Bc4|Nf6|c5/ });
  await intro.click();
  await expect(intro).toBeFocused();
  await expect(futureMoves).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(analysis.getByRole("button", { name: /e5/ })).toHaveAttribute("aria-current", "step");
  await expect(futureMoves).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(reply).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(reply).toHaveAttribute("aria-current", "step");
  await expect(next).toBeDisabled();
  await expect(futureMoves).toHaveCount(0);
  await giveUp.click();
  await expect(analysis.getByRole("button", { name: /Nc6/ })).toBeVisible();
  await latest.click();
  const finalMove = analysis.getByRole("button", { name: /Nf6/ });
  const previousMove = analysis.getByRole("button", { name: /Bc4/ });
  await expect(finalMove).toHaveAttribute("aria-current", "step");

  // Focus stays in the move box after a click. Each arrow must navigate one ply.
  await finalMove.click();
  await expect(finalMove).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(previousMove).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("ArrowRight");
  await expect(finalMove).toHaveAttribute("aria-current", "step");
  await expect(page).toHaveURL(/\/solve\/102$/);

  // The same keys should edit text normally when focus moves to the tag picker.
  await page.getByRole("button", { name: "Add tag", exact: true }).click();
  const tagSearch = page.getByRole("searchbox", { name: "Search tags" });
  await tagSearch.fill("frk");
  await tagSearch.press("ArrowLeft");
  await tagSearch.press("ArrowLeft");
  await tagSearch.press("o");
  await expect(tagSearch).toHaveValue("fork");
  await expect(finalMove).toHaveAttribute("aria-current", "step");
});
