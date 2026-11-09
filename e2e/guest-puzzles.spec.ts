import { expect, test } from "@playwright/test";

test("guests can solve only the five presets without fetching puzzle data", async ({ page }) => {
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
  await page.getByRole("button", { name: /try 5 guest puzzles/i }).click();

  const playMove = async (move: string) => {
    const moveField = page.getByRole("textbox", { name: "Move", exact: true });
    if (!(await moveField.isVisible())) {
      await page.getByText("Enter a move by keyboard").click();
    }
    await moveField.fill(move);
    await moveField.press("Enter");
  };

  await playMove("e1e8");
  await expect(page.getByText(/enter a legal move/i)).toBeVisible();
  await playMove("f3g3");
  await expect(page.getByText("Not mate. Try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next puzzle" })).toHaveCount(0);
  await playMove("f3f7");
  await expect(page.getByRole("button", { name: "Next puzzle" })).toBeFocused();

  await page.reload();
  await page.getByRole("button", { name: "Resume guest puzzles" }).click();

  // Both knight captures mate in puzzle 2; try the alternative to the game move.
  for (const [offset, move] of ["e4d2", "b4d2", "d8d2", "h5f7"].entries()) {
    await expect(page.getByRole("heading", { name: `Puzzle ${offset + 2} of 5` })).toBeFocused();
    await playMove(move);
    await page.getByRole("button", { name: offset === 3 ? "Finish" : "Next puzzle" }).click();
  }

  await expect(page.getByRole("heading", { name: "Log in to access puzzles" })).toBeFocused();
  await expect(login).toBeVisible();
  await expect(page.getByRole("button", { name: /guest/i })).toHaveCount(0);
  await page.reload();
  await expect(login).toBeVisible();
  await expect(page.getByRole("button", { name: /guest/i })).toHaveCount(0);
  expect(requests).toEqual([]);
});
