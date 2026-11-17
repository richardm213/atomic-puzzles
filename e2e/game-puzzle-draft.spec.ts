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

test("opening explorer extends puzzle drafts without changing the source board", async ({
  page,
}) => {
  await page.route("**/api/opening-explorer?**", (route) => {
    const fen = new URL(route.request().url()).searchParams.get("fen") ?? "";
    const blackToMove = fen.split(" ")[1] === "b";
    return route.fulfill({
      json: {
        moves: [
          {
            uci: blackToMove ? "e7e5" : "e2e4",
            games: 10,
            whiteWins: 5,
            draws: 0,
            blackWins: 5,
            avgOpponentRating: null,
          },
        ],
        recentGames: [],
      },
    });
  });
  await page.route("**/api/puzzles/submit", (route) => route.fulfill({ json: { puzzleId: null } }));
  // Analysis and practice own separate draft/navigation state. Exercise both,
  // including the practice panel's distinct layout at mobile width.
  for (const route of ["/analysis", "/practice"]) {
    if (route === "/practice") await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(route);
    const pgn = page.getByRole("textbox", { name: "PGN", exact: true });
    const launch = page.getByRole("button", { name: "Submit puzzle", exact: true });
    await expect(launch).toBeEnabled();
    const sourcePgn = await pgn.inputValue();
    await launch.click();
    const composer = page.getByRole("form", { name: "Puzzle draft" });
    const toolbar = page.getByLabel(
      route === "/analysis" ? "Analysis menu" : "Practice navigation",
      { exact: true },
    );
    const toggle = toolbar.getByRole("button", {
      name: /(?:Show|Hide) (?:opening explorer|database moves)/,
    });
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute("aria-label", /^Show /);
    await toggle.click();
    const explorer = page.getByRole("region", { name: "Opening explorer", exact: true });
    await explorer.getByRole("button", { name: "Play e4", exact: true }).click();
    await expect(pgn).toHaveValue(/^1\. e4(?: \*)?$/);
    await explorer.getByRole("button", { name: "Play e5", exact: true }).click();
    await expect(pgn).toHaveValue(/^1\. e4 e5(?: \*)?$/);
    await toggle.click();
    await expect(explorer).not.toBeVisible();
    await expect(composer).toBeVisible();
    await expect(pgn).toHaveValue(/^1\. e4 e5(?: \*)?$/);
    await composer.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(pgn).toHaveValue(sourcePgn);
  }
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

test("tournament game details show post-game scores and clear the clinch marker when navigating", async ({
  page,
}) => {
  const winners = ["Alice", "Bob", "Alice", "Bob", "Alice", "Bob", "Alice", "Bob", "Alice", "draw"];
  const games = winners.map((winner, index) => {
    const whiteSlot = index % 2 ? 2 : 1;
    const winnerSlot = winner === "draw" ? 0 : winner === "Alice" ? 1 : 2;
    const winnerCode = winner === "draw" ? "d" : winnerSlot === whiteSlot ? "w" : "b";
    return `score-${index + 1},${winnerCode},${winnerSlot},${whiteSlot}`;
  });
  await page.route("**/__e2e_supabase/**/tournament_matches?**", (route) => {
    const matchId = new URL(route.request().url()).searchParams.get("match_id");
    return route.fulfill({
      json:
        matchId === "eq.score-match"
          ? [
              {
                tournament: "awc2026",
                bracket: "main",
                round: "Quarterfinals",
                order: 1,
                id: "wb-r2-m1",
                match_id: "score-match",
                p1: "Bob",
                p2: "Alice",
                s1: 4.5,
                s2: 5.5,
              },
            ]
          : [],
    });
  });
  await page.route("**/api/archive-data?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("resource") === "game") {
      const id = params.get("gameId") ?? "";
      const ordinary = id === "ordinary-game";
      const index = ordinary ? 1 : Number(id.split("-")[1]);
      return route.fulfill({
        json: {
          game_id: id,
          game_index: index,
          result: index === 10 ? 1 : 2,
          moves: ["e2e4", "e7e5"],
          clocks: null,
          move_ts: null,
          initial_fen: null,
          external_match_id: ordinary ? "ordinary-match" : "score-match",
          mode: "blitz",
          start_ts: 1_700_000_000_000,
          source: "friend",
          player_1: "Alice",
          player_2: "Bob",
          time_control: "3+2",
          tournament: ordinary ? null : "awc2026",
          spectator_chat:
            ordinary || index === 9
              ? [
                  { username: "SpectatorName", text: "<b>Great move!</b>" },
                  { username: "Other", text: "Nice game" },
                ]
              : index === 10
                ? []
                : null,
          ratings_are_per_game: true,
          p1_before_rating: 1900,
          p1_after_rating: 1905,
          p1_before_rd: 50,
          p1_after_rd: 50,
          p2_before_rating: 1950,
          p2_after_rating: 1945,
          p2_before_rd: 50,
          p2_after_rd: 50,
        },
      });
    }
    if (params.get("resource") === "matches") {
      const ordinary = params.get("matchId") === "ordinary-match";
      return route.fulfill({
        json: {
          rows: ordinary
            ? []
            : [
                {
                  match_id: "score-match",
                  mode: "blitz",
                  player_1: "Alice",
                  player_2: "Bob",
                  start_ts: 1_700_000_000_000,
                  time_control: "3+2",
                  source: "friend",
                  tournament_id: "awc2026",
                  games,
                },
              ],
          total: ordinary ? 0 : 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/game/score-9");
  const comments = page.getByRole("region", { name: "Spectator comments", exact: true });
  await expect(comments.getByRole("listitem")).toHaveText([
    "SpectatorName <b>Great move!</b>",
    "Other Nice game",
  ]);
  await expect(comments.locator("b")).toHaveCount(0);
  await expect(comments.getByRole("textbox")).toHaveCount(0);
  await comments.getByRole("checkbox", { name: "Hide chat", exact: true }).check();
  await expect(comments.getByRole("list")).toHaveCount(0);
  await page.reload();
  await expect(comments.getByRole("checkbox", { name: "Hide chat", exact: true })).toBeChecked();
  await expect(comments.getByRole("list")).toHaveCount(0);
  await comments.getByRole("checkbox", { name: "Hide chat", exact: true }).uncheck();
  await expect(comments.getByRole("listitem")).toHaveCount(2);
  const details = page.getByRole("complementary", { name: "Game details", exact: true });
  await expect(details.getByLabel("Alice: 5 match points", { exact: true })).toBeVisible();
  await expect(details.getByRole("img", { name: "Match clinched" })).toHaveCount(0);
  await page.getByRole("link", { name: "Next game, game 10", exact: true }).click();
  await expect(comments.getByText("No spectator comments.", { exact: true })).toBeVisible();
  await expect(details.getByLabel("Alice: 5.5 match points", { exact: true })).toBeVisible();
  await expect(details.getByRole("img", { name: "Match clinched" })).toBeVisible();
  await expect(details.getByText("1900", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(details.getByLabel("Bob: 4.5 match points", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Previous game, game 9", exact: true }).click();
  await expect(details.getByRole("img", { name: "Match clinched" })).toHaveCount(0);
  await expect(comments.getByText("<b>Great move!</b>", { exact: true })).toBeVisible();
  await page.goto("/game/score-8");
  await expect(
    comments.getByText("Spectator chat hasn’t been captured yet.", { exact: true }),
  ).toBeVisible();
  await page.goto("/game/ordinary-game");
  await expect(details.getByText("1900", { exact: true })).toBeVisible();
  await expect(details.getByLabel(/match points$/)).toHaveCount(0);
  await expect(comments).toHaveCount(0);
});
