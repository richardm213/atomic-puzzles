import { expect, test } from "./fixtures";

test("game puzzle drafts optionally copy editable continuations from the original game", async ({
  page,
}) => {
  await page.route("**/api/archive-data?**", (route) => {
    const resource = new URL(route.request().url()).searchParams.get("resource");
    return route.fulfill({
      json:
        resource === "game"
          ? {
              game_id: "draft-test",
              game_index: 1,
              result: 0,
              moves: ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"],
              clocks: null,
              move_ts: null,
              initial_fen: null,
              external_match_id: "test-match",
              mode: "blitz",
              start_ts: 1700000000,
              source: "lichess",
              player_1: "White",
              player_2: "Black",
              time_control: "180+2",
              tournament: null,
              p1_before_rating: null,
              p1_after_rating: null,
              p1_before_rd: null,
              p1_after_rd: null,
              p2_before_rating: null,
              p2_after_rating: null,
              p2_before_rd: null,
              p2_after_rd: null,
            }
          : [],
    });
  });
  const submissions: Record<string, unknown>[] = [];
  await page.route("**/api/puzzles/submit", (route) => {
    const input = route.request().postDataJSON();
    if (input.action === "match-context") {
      return route.fulfill({ json: { setName: "", players: ["White", "Black"] } });
    }
    if (input.action === "starting-fen-match") {
      return route.fulfill({ json: { puzzleId: null } });
    }
    submissions.push(input);
    return route.fulfill({ json: { destination: "review", setName: "" } });
  });
  await page.goto("/game/draft-test");
  const pgn = page.getByRole("textbox", { name: "PGN", exact: true });
  const launch = page.getByRole("button", { name: "Submit puzzle", exact: true });
  const composer = page.getByRole("form", { name: "Puzzle draft" });
  await launch.click();
  await expect(pgn).toHaveValue("");
  await composer.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Engine settings", exact: true }).click();
  await page.getByRole("checkbox", { name: "Start puzzle with PGN moves" }).check();
  await page.getByRole("spinbutton", { name: "Moves per side" }).fill("1");
  await page.keyboard.press("Escape");

  await launch.click();
  await expect(pgn).toHaveValue("1. e4 e5 *");
  await pgn.fill("1. d4 d5");
  await pgn.press("Enter");
  await expect(pgn).toHaveValue("1. d4 d5 *");
  await composer.getByRole("button", { name: "Cancel" }).click();

  // Start after White’s first move and copy only the remaining continuation.
  await page.getByRole("button", { name: "Engine settings", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Moves per side" }).fill("10");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "1. e4", exact: true }).click();
  await launch.click();
  await expect(pgn).toHaveValue("1... e5 2. Nf3 Nc6 3. Bc4 *");
  await composer.getByRole("button", { name: "Submit puzzle", exact: true }).click();
  await expect(composer).not.toBeVisible();
  expect(submissions).toEqual([
    expect.objectContaining({
      action: "add-match-puzzle",
      gameId: "draft-test",
      positionMoves: ["e4"],
      solution: "1... e5 2. Nf3 Nc6 3. Bc4 *",
    }),
  ]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/analysis");
  await pgn.fill("1. d4 d5 2. Nf3");
  await pgn.press("Enter");
  await page.getByRole("button", { name: "Go to start" }).click();
  await launch.click();
  await expect(pgn).toHaveValue("1. d4 d5 2. Nf3 *");
});

test("game URLs retain side and exact ply and wait for navigation to settle", async ({ page }) => {
  await page.route("**/api/archive-data?**", (route) =>
    route.fulfill({
      json:
        new URL(route.request().url()).searchParams.get("resource") === "game"
          ? {
              game_id: "wolf-url",
              external_match_id: "url-match",
              result: 0,
              mode: "wolfrandom",
              player_1: "White",
              player_2: "Black",
              time_control: "180+2",
              start_ts: 1700000000000,
              initial_fen: null,
              tournament: null,
              moves: ["g1f3", "g8f6", "f3g1", "f6g8", "e2e4", "e7e5", "d2d3", "d7d6"],
            }
          : [],
    }),
  );
  await page.addInitScript(() => {
    const writes: string[] = [];
    Object.assign(window, { gameUrlWrites: writes });
    const replace = history.replaceState.bind(history);
    history.replaceState = (state, unused, url) => {
      if (url && /\/game\/.*\/(white|black)#\d+$/.test(String(url))) writes.push(String(url));
      replace(state, unused, url);
    };
  });
  await page.goto("/game/wolf-url");
  await expect(page).toHaveURL(/\/game\/wolf-url\/white#6$/);

  await page.goto("/game/wolf-url/black#3");
  const next = page.getByRole("button", { name: "Next move", exact: true });
  await expect(next).toBeEnabled();
  await page.evaluate(
    () => ((window as unknown as { gameUrlWrites: string[] }).gameUrlWrites.length = 0),
  );
  await next.click();
  await page.waitForTimeout(250);
  await next.click();
  await page.waitForTimeout(350);
  await expect(page).toHaveURL(/\/black#3$/);
  await expect(page).toHaveURL(/\/black#5$/);
  expect(
    await page.evaluate(() => (window as unknown as { gameUrlWrites: string[] }).gameUrlWrites),
  ).toEqual(["/game/wolf-url/black#5"]);

  await page.getByRole("button", { name: "Engine settings", exact: true }).click();
  await page.getByRole("button", { name: "Flip board", exact: true }).click();
  await expect(page).toHaveURL(/\/white#5$/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Next move", exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/white#5$/);

  await page.goto("/game/wolf-url/black#0");
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page).toHaveURL(/\/black#1$/);
});
