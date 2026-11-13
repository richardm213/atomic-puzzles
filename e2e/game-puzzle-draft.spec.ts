import { convertUciLineToSan, parseSolutionUciLines } from "../shared/domain/chess/pgn";
import transpositionFixtures from "../src/lib/chess/fixtures/transpositionPuzzles.json" with { type: "json" };
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
      const initialPosition = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -";
      return route.fulfill({ json: { puzzleId: input.fen === initialPosition ? 42 : null } });
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
  await expect(composer.getByRole("link", { name: "puzzle 42" })).toHaveAttribute(
    "href",
    "/solve/42",
  );
  await composer.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Engine settings", exact: true }).click();
  await page.getByRole("checkbox", { name: "Start puzzle with PGN moves" }).check();
  await page.getByRole("spinbutton", { name: "Moves per side" }).fill("1");
  await page.keyboard.press("Escape");

  await launch.click();
  await expect(pgn).toHaveValue("1. e4 e5 *");
  await pgn.fill("1. d4! d5");
  await pgn.press("Enter");
  await expect(pgn).toHaveValue("1. d4 d5 *");
  await page.getByRole("button", { name: "1. d4", exact: true }).click({ button: "right" });
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Annotate with !", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitemcheckbox", { name: "Annotate with ?", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
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
  await expect(composer.getByRole("link", { name: "puzzle 42" })).toHaveAttribute(
    "href",
    "/solve/42",
  );
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

test("puzzle drafting detects a played transposition and keeps saved copies synchronized", async ({
  page,
}) => {
  const fixture = transpositionFixtures.find((puzzle) => puzzle.id === "supplied")!;
  const submissions: Record<string, unknown>[] = [];
  let finishSave: (success: boolean) => void = () => {
    throw new Error("No save pending");
  };
  await page.route("**/api/puzzles/submit", async (route) => {
    const input = route.request().postDataJSON();
    if (input.action === "starting-fen-match") return route.fulfill({ json: { puzzleId: null } });
    submissions.push(input);
    const success = await new Promise<boolean>((resolve) => {
      finishSave = resolve;
    });
    return success
      ? route.fulfill({ json: { destination: "review", puzzle: { id: 901, ...input } } })
      : route.fulfill({ status: 503, json: { error: "Save failed for regression test" } });
  });
  await page.goto("/analysis");
  const fen = page.getByRole("textbox", { name: "FEN", exact: true });
  await fen.fill(fixture.fen);
  await fen.press("Enter");
  await page.getByRole("button", { name: "Submit puzzle", exact: true }).click();
  const composer = page.getByRole("form", { name: "Puzzle draft" });
  const pgn = page.getByRole("textbox", { name: "PGN", exact: true });
  await pgn.fill("9. Bc4 Ng4 10. f3 Nf2");
  await pgn.press("Enter");
  const jumps = composer.getByRole("button", { name: "Go to original continuation" });
  await expect(jumps).toHaveCount(0);
  await page.getByRole("button", { name: "Go to start", exact: true }).click();

  const play = async (uci: string) => {
    const board = page.locator("cg-board:visible");
    await board.scrollIntoViewIfNeeded();
    const bounds = await board.boundingBox();
    if (!bounds) throw new Error("Draft board is missing");
    for (const square of [uci.slice(0, 2), uci.slice(2, 4)]) {
      await page.mouse.click(
        bounds.x + ((square.charCodeAt(0) - 97 + 0.5) * bounds.width) / 8,
        bounds.y + ((8 - Number(square[1]) + 0.5) * bounds.height) / 8,
      );
    }
  };
  await play("f2f3");
  await expect(jumps).toHaveCount(0);
  await play("h6g4");
  await expect(jumps).toHaveCount(0);
  await play("f1c4");
  await expect(jumps).toHaveCount(1);
  const readLines = async () =>
    parseSolutionUciLines(fixture.fen, await pgn.inputValue()).map((line) =>
      convertUciLineToSan(fixture.fen, line),
    );
  await expect.poll(readLines).toEqual([
    ["Bc4", "Ng4", "f3", "Nf2"],
    ["f3", "Ng4", "Bc4", "Nf2"],
  ]);
  await jumps.click();
  await expect(composer.getByRole("button", { name: "10. f3", exact: true })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await page.keyboard.press("ArrowRight");
  await expect(composer.getByRole("button", { name: "Nf2", exact: true })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await play("d1b1");
  await expect
    .poll(async () => (await readLines()).map((line) => line.slice(3)))
    .toEqual([
      ["Nf2", "Qb1"],
      ["Nf2", "Qb1"],
    ]);
  const followup = composer.getByRole("button", { name: "11. Qb1", exact: true });
  await followup.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect
    .poll(async () => (await readLines()).map((line) => line.slice(3)))
    .toEqual([["Nf2"], ["Nf2"]]);
  await composer.getByRole("button", { name: "Submit puzzle", exact: true }).click();
  await expect.poll(() => submissions.length).toBe(1);
  await expect(composer.getByRole("textbox", { name: "Explanation" })).toBeDisabled();
  await expect(pgn).toHaveAttribute("readonly", "");
  await play("f3f4");
  await expect
    .poll(async () => (await readLines()).map((line) => line.slice(3)))
    .toEqual([["Nf2"], ["Nf2"]]);
  finishSave(false);
  const submit = composer.getByRole("button", { name: "Submit puzzle", exact: true });
  await expect(submit).toBeEnabled();
  await expect(pgn).toBeEditable();
  await expect(composer.getByRole("textbox", { name: "Explanation" })).toBeEnabled();
  await submit.click();
  await expect.poll(() => submissions.length).toBe(2);
  finishSave(true);
  await expect(composer).not.toBeVisible();
  const saved = String(submissions[1]!.solution);
  expect(saved).not.toMatch(/→|transposition/i);
  expect(
    parseSolutionUciLines(fixture.fen, saved).map((line) => convertUciLineToSan(fixture.fen, line)),
  ).toEqual([
    ["Bc4", "Ng4", "f3", "Nf2"],
    ["f3", "Ng4", "Bc4", "Nf2"],
  ]);
});
