import { convertUciLineToSan, parseSolutionUciLines } from "../shared/domain/chess/pgn";
import transpositionFixtures from "../src/lib/chess/fixtures/transpositionPuzzles.json" with { type: "json" };
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

  await page.route("**/api/puzzles/submit", (route) => route.fulfill({ json: { puzzleId: 42 } }));
  await page.goto("/puzzles/review");
  await expect(page.getByRole("link", { name: "puzzle 42" })).toHaveAttribute("href", "/solve/42");
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();

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
  await page.route("**/api/puzzles/progress", (route) => {
    const body = route.request().postDataJSON();
    const isStatus = body.action === "gradingState";
    const resigned = Boolean(body.attempt?.resigned);
    const grading = {
      runId: isStatus || resigned ? null : "bf6cd63f-c399-4d3c-905c-04ab563e8949",
      graded: !resigned,
      availableAt: resigned ? "2099-01-01T00:00:00Z" : null,
      permanent: false,
      hasAttempted: !isStatus,
      hasSolved: false,
      misses: isStatus || resigned ? 0 : 1,
      color: isStatus ? null : "red",
    };
    return route.fulfill({
      json: isStatus
        ? grading
        : {
            coinDelta: resigned ? 0 : -1.5,
            rated: !resigned,
            graded: true,
            unratedUntil: grading.availableAt,
            ratingEvent: null,
            grading,
          },
    });
  });
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
  const giveUp = analysis.getByRole("button", { name: "Resign and reveal the solution" });
  await expect(giveUp).toBeVisible();
  // After a wrong move, arrows from inside the move box can replay the
  // played line, but cannot cross into the unrevealed solution.
  const futureMoves = analysis.getByRole("button", { name: /Nc6|Bc4|Nf6|c5/ });
  await intro.click();
  await expect(intro).toBeFocused();
  await expect(futureMoves).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(analysis.getByRole("button", { name: /e5/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(futureMoves).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await expect(reply).toHaveAttribute("aria-current", "step");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(reply).toHaveAttribute("aria-current", "step");
  await expect(next).toBeDisabled();
  await expect(futureMoves).toHaveCount(0);
  await giveUp.click();
  await analysis.getByRole("button", { name: "Confirm resignation" }).click();
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

test("a puzzle without an intro keeps its original move numbers through play and navigation", async ({
  page,
}) => {
  await page.route("**/api/public-data?**", (route) => {
    if (new URL(route.request().url()).searchParams.get("resource") === "puzzle-solver-index")
      return route.fulfill({ json: { rows: [{ id: 2138 }] } });
    return route.fallback();
  });
  await page.route("**/api/puzzles/play", (route) =>
    route.fulfill({
      json: {
        puzzles: [
          {
            id: 2138,
            fen: "5rk1/p1p1q3/8/6pp/1P1Pp3/5PnP/P5P1/R1BQK2R w KQ - 0 17",
            solution: "17. Qb3+ Qe6 18. f4",
            author: "atcly",
          },
        ],
      },
    }),
  );
  await page.route("**/api/puzzles/progress", (route) => {
    const status = route.request().postDataJSON().action === "gradingState";
    const grading = {
      runId: null,
      graded: status,
      availableAt: status ? null : "2099-01-01T00:00:00Z",
      permanent: false,
      hasAttempted: !status,
      hasSolved: !status,
      misses: 0,
      color: status ? null : "green",
    };
    return route.fulfill({
      json: status
        ? grading
        : {
            coinDelta: 0,
            rated: true,
            graded: true,
            ratingEvent: null,
            unratedUntil: grading.availableAt,
            grading,
          },
    });
  });
  await page.goto("/solve/2138");
  const analysis = page.getByRole("region", { name: "Puzzle analysis" });
  const playWhiteMove = async (uci: string) => {
    const bounds = await page.locator("cg-board").boundingBox();
    if (!bounds) throw new Error("Puzzle board is missing");
    for (const square of [uci.slice(0, 2), uci.slice(2, 4)]) {
      await page.mouse.click(
        bounds.x + ((square.charCodeAt(0) - 97 + 0.5) * bounds.width) / 8,
        bounds.y + ((8 - Number(square[1]) + 0.5) * bounds.height) / 8,
      );
    }
  };
  await expect(page.locator("cg-board")).toBeVisible();
  await playWhiteMove("d1b3");
  await expect(analysis.getByRole("button", { name: "17. Qb3+", exact: true })).toBeVisible();
  await expect(analysis.getByRole("button", { name: "Qe6", exact: true })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await playWhiteMove("f3f4");
  const finalMove = analysis.getByRole("button", { name: "18. f4", exact: true });
  await expect(finalMove).toHaveAttribute("aria-current", "step");
  await analysis.getByRole("button", { name: "17. Qb3+", exact: true }).click();
  await expect(finalMove).toBeVisible();
  await analysis.getByRole("button", { name: "Go to start" }).click();
  await expect(analysis.getByRole("button", { name: "17. Qb3+", exact: true })).toBeVisible();
});

test("tag popups close on the backdrop and dismiss only the topmost dialog", async ({ page }) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { user: { username: "seaside_tiramisu" } } }),
  );
  await page.route("**/api/puzzles/play", (route) =>
    route.fulfill({ json: { puzzles: [{ ...queuePuzzle, id: 101, tags: ["fork"] }] } }),
  );
  await page.route("**/api/puzzles/tags?**", (route) =>
    route.fulfill({ json: { votes: [{ tag: "fork", up: 3, down: 0, vote: 0 }] } }),
  );
  await page.goto("/admin/puzzle-test/101");
  const tag = page.getByRole("button", { name: /^View definition for Fork\b/ });
  const definition = page.getByRole("dialog", { name: "Fork", exact: true });
  await tag.click();
  await definition.getByRole("heading", { name: "Fork", exact: true }).click();
  await expect(definition).toBeVisible();
  await definition.getByRole("button", { name: "Rename Fork", exact: true }).click();
  const rename = page.getByRole("dialog", { name: "Rename tag", exact: true });
  await expect(rename).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(rename).toHaveCount(0);
  await expect(definition).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(definition).toHaveCount(0);
  await tag.click();
  await expect(definition).toBeVisible();
});

test("recent puzzle editing links multiple transpositions while view mode keeps full PGN", async ({
  page,
}) => {
  const fixture = transpositionFixtures.find((puzzle) => puzzle.id === 1209)!;
  let stored = fixture.solution;
  let finishSave: () => void = () => {
    throw new Error("No save pending");
  };
  const response = () => ({
    puzzle: {
      ...queuePuzzle,
      ...fixture,
      solution: stored,
      author: "admin",
      tags: [],
      deleted_at: null,
    },
    olderPuzzleId: null,
    newerPuzzleId: null,
    attempts: [],
  });
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { user: { username: "seaside_tiramisu" } } }),
  );
  await page.route("**/api/puzzles/admin", async (route) => {
    const input = route.request().postDataJSON();
    if (input.action === "tag-votes")
      return route.fulfill({ json: { rows: [], nextCursor: null } });
    if (input.action === "update") {
      await new Promise<void>((resolve) => {
        finishSave = resolve;
      });
      stored = input.solution;
    }
    return route.fulfill({ json: response() });
  });
  await page.route("**/api/puzzles/submit", (route) => route.fulfill({ json: { puzzleId: null } }));
  await page.goto("/puzzles/recent");
  const moves = page.getByRole("region", { name: "Solution moves" });
  const jumps = moves.getByRole("button", { name: "Go to original continuation" });
  await expect(moves.getByRole("button", { name: /Rf2/ })).toHaveCount(4);
  await expect(jumps).toHaveCount(0);
  await page.getByRole("button", { name: "Edit puzzle", exact: true }).click();
  await expect(jumps).toHaveCount(3);
  const followup = moves.getByRole("button", { name: /Rf2/ });
  await expect(followup).toHaveCount(1);
  await followup.click({ button: "right" });
  await page.getByRole("menuitemcheckbox", { name: "Annotate with ?", exact: true }).click();
  const pgn = page.getByRole("textbox", { name: "Solution PGN", exact: true });
  await expect
    .poll(async () =>
      parseSolutionUciLines(fixture.fen, await pgn.inputValue()).map((line) =>
        convertUciLineToSan(fixture.fen, line).at(-1),
      ),
    )
    .toEqual(["Rf2?", "Rf2?", "Rf2?", "Rf2?"]);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(pgn).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Author", exact: true })).toBeDisabled();
  await expect(page.getByRole("spinbutton", { name: "Puzzle ID", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Go", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Explanation", exact: true })).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(moves.getByRole("button", { name: /Rf2\?/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  finishSave();
  await expect(jumps).toHaveCount(0);
  await expect(moves.getByRole("button", { name: /Rf2\?/ })).toHaveCount(4);
  expect(stored).not.toMatch(/→|transposition/i);
  const savedLines = parseSolutionUciLines(fixture.fen, stored);
  expect(savedLines).toHaveLength(4);
  expect(savedLines.every((line) => line.at(-1)?.annotation === "?")).toBe(true);
});
