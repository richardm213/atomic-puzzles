import { expect, test } from "@playwright/test";

test("guest puzzle URLs follow progress without fetching puzzle data", async ({ page }) => {
  const requests: string[] = [];
  await page.route(/\/(api|__e2e_supabase|rest\/v1)\//, (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/auth/session", (route) => route.fulfill({ status: 401, json: {} }));

  await page.goto("/solve/101");
  const login = page.getByRole("button", { name: "Log in with Lichess" });
  await expect(login).toBeVisible();
  await expect(page.getByRole("button", { name: /guest puzzles/i })).toHaveCount(0);

  await page.goto("/solve");
  await expect(login).toBeVisible();
  await page.evaluate(() => localStorage.setItem("atomic-puzzles:guest-trial:v1", "5"));
  await page.reload();
  await page.getByRole("button", { name: /try 20 guest puzzles/i }).click();
  await expect(page).toHaveURL(/\/solve\/guest\/1$/);

  const playMove = async (move: string) => {
    const board = page.locator("cg-board");
    await expect(board).toBeVisible();
    const bounds = await board.boundingBox();
    if (!bounds) throw new Error("Puzzle board is missing");

    // Both positions exercised here have White at the bottom.
    for (const square of [move.slice(0, 2), move.slice(2)]) {
      const file = square.charCodeAt(0) - "a".charCodeAt(0);
      const rank = Number(square[1]);
      await page.mouse.click(
        bounds.x + (file + 0.5) * (bounds.width / 8),
        bounds.y + (8.5 - rank) * (bounds.height / 8),
      );
    }
  };

  const white = page.getByRole("group", { name: "White", exact: true });
  await expect(white.getByLabel("Castling rights: O-O, O-O-O")).toBeVisible();
  await expect(white.getByLabel("Material difference: no extra material")).toBeVisible();
  await playMove("h6h5");
  await expect(page.getByText("Try another move.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next puzzle" })).toHaveCount(0);
  await playMove("h6f8");
  await page.getByRole("button", { name: "Next puzzle" }).click();
  await expect(page).toHaveURL(/\/solve\/guest\/2$/);

  await page.goBack();
  await expect(page.getByRole("heading", { name: "Puzzle 1 of 20" })).toBeVisible();
  await page.goForward();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Puzzle 2 of 20" })).toBeFocused();

  // The URL cannot skip unsolved puzzles.
  await page.goto("/solve/guest/20");
  await expect(page).toHaveURL(/\/solve\/guest\/2$/);

  // Exercise the final multi-move puzzle without replaying every intermediate position.
  await page.evaluate(() => localStorage.setItem("atomic-puzzles:guest-trial:v2", "19"));
  await page.goto("/solve/guest/20");
  await expect(page.getByRole("heading", { name: "Puzzle 20 of 20" })).toBeFocused();
  await playMove("d3b5");
  await expect(page.getByText("Good move. Keep going.")).toBeVisible();
  await expect(white.getByLabel("Material difference: queen, pawn, pawn")).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish" })).toHaveCount(0);
  // This move is only legal after the board has played Black's reply.
  await playMove("e5c7");
  await expect(page.getByText(/^White pieces:.*queen on c7/)).toBeAttached();
  await playMove("c7e7");
  await page.getByRole("button", { name: "Finish" }).click();

  await expect(page).toHaveURL(/\/solve$/);
  await expect(page.getByRole("heading", { name: "Log in to access puzzles" })).toBeFocused();
  await expect(login).toBeVisible();
  await expect(page.getByRole("button", { name: /guest/i })).toHaveCount(0);
  await page.goto("/solve/guest/20");
  await expect(page).toHaveURL(/\/solve$/);
  await expect(login).toBeVisible();
  await expect(page.getByRole("button", { name: /guest/i })).toHaveCount(0);
  expect(requests).toEqual([]);
});
