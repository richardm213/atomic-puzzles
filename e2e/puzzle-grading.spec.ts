import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const playBlackMove = async (page: Page, uci: string) => {
  const board = page.locator("cg-board");
  await expect(board).toBeVisible();
  const bounds = await board.boundingBox();
  if (!bounds) throw new Error("Puzzle board missing");
  for (const square of [uci.slice(0, 2), uci.slice(2, 4)]) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]);
    await page.mouse.click(
      bounds.x + ((7.5 - file) * bounds.width) / 8,
      bounds.y + ((rank - 0.5) * bounds.height) / 8,
    );
  }
};

test("a graded run survives reload, retries a failed save, and requires confirmed resignation", async ({
  page,
}) => {
  const runId = "bf6cd63f-c399-4d3c-905c-04ab563e8949";
  const requests: Array<{
    attempt: { id: string; runId: string | null; resigned?: boolean; pgn: string };
  }> = [];
  let misses = 0;
  let ended = false;
  let failedOnce = false;
  const grading = () => ({
    runId: misses && !ended ? runId : null,
    graded: !ended,
    availableAt: ended ? "2099-01-01T00:00:00Z" : null,
    permanent: false,
    hasAttempted: misses > 0,
    hasSolved: false,
    misses: ended ? 0 : misses,
    color: misses ? "red" : null,
  });
  await page.route("**/api/puzzles/play", (route) =>
    route.fulfill({
      json: {
        puzzles: [
          {
            id: 102,
            author: "another-player",
            fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
            solution: "1... e5 2. Nf3 Nc6",
          },
        ],
      },
    }),
  );
  await page.route("**/api/puzzles/progress", (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "gradingState") return route.fulfill({ json: grading() });
    requests.push(body);
    if (misses === 1 && !body.attempt.resigned && !failedOnce) {
      failedOnce = true;
      return route.fulfill({ status: 503, json: { error: "Temporary interruption" } });
    }
    if (body.attempt.resigned) ended = true;
    else misses += 1;
    return route.fulfill({
      json: {
        coinDelta: ended ? 0 : -1.5 * Math.pow(0.5, misses - 1),
        rated: requests.length === 1,
        graded: true,
        unratedUntil: grading().availableAt,
        ratingEvent: null,
        grading: grading(),
      },
    });
  });
  await page.route("**/__e2e_supabase/rest/v1/puzzle_progress?**", (route) =>
    route.fulfill({
      json: misses
        ? [
            {
              username: "e2e-player",
              puzzle_id: "102",
              first_attempt_at: "2026-07-09T09:55:47Z",
              first_attempt_duration_ms: 65000,
              puzzle_correct: false,
              rated: true,
              incorrect_move: "1... a6",
              has_solved: false,
              attempt_color: "red",
            },
            {
              username: "recovered-player",
              puzzle_id: "102",
              first_attempt_at: "2026-03-01T12:00:00Z",
              first_attempt_duration_ms: 42000,
              puzzle_correct: false,
              rated: true,
              incorrect_move: "1... h6",
              has_solved: true,
              attempt_color: "yellow",
            },
          ]
        : [],
    }),
  );

  await page.goto("/solve/102");
  await expect(page.locator("cg-board")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resign and reveal the solution" })).toHaveCount(0);
  await expect(page.getByText("Graded", { exact: true })).toHaveCount(0);
  await playBlackMove(page, "a7a6");
  await expect.poll(() => requests.length).toBe(1);
  await expect(page.getByRole("button", { name: "Resign and reveal the solution" })).toBeEnabled();
  await expect(page.getByText("Graded", { exact: true })).toHaveCount(0);

  await expect(page.getByRole("tab", { name: "Other attempts", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByText("Graded", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resign and reveal the solution" })).toBeEnabled();
  await playBlackMove(page, "b7b6");
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[1]?.attempt.id).toBe(requests[2]?.attempt.id);
  expect(requests[2]?.attempt.runId).toBe(runId);
  expect(requests[2]?.attempt.pgn).toContain("b6");

  await page.getByRole("button", { name: "Resign and reveal the solution" }).click();
  const confirm = page.getByRole("button", { name: "Confirm resignation" });
  await expect(confirm).toHaveAttribute("aria-pressed", "true");
  expect(requests).toHaveLength(3);
  await confirm.click();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests[3]?.attempt.resigned).toBe(true);
  await page.getByRole("tab", { name: "Other attempts", exact: true }).click();
  await expect(page.getByLabel("Played 1... a6")).toBeVisible();
  await expect(page.getByLabel("Attempt time 1:05")).toBeVisible();
  const recovered = page.getByRole("listitem").filter({
    has: page.getByRole("link", { name: "recovered-player", exact: true }),
  });
  await expect(recovered.getByLabel("Played 1... h6")).toBeVisible();
  await expect(recovered.getByLabel("Attempt time 0:42")).toBeVisible();
  const indicator = recovered.getByLabel("Solved on the second try", { exact: true });
  await expect(indicator).toHaveAttribute("title", "Solved on the second try");
  const colors = await indicator.evaluate((element) => {
    const sample = document.createElement("span");
    sample.style.color = "var(--color-warning)";
    document.body.append(sample);
    const expected = getComputedStyle(sample).color;
    sample.remove();
    return { actual: getComputedStyle(element).color, expected };
  });
  expect(colors.actual).toBe(colors.expected);
});

test("solving after a mistake earns coins while the first move and time stay in Other Attempts", async ({
  page,
}) => {
  const runId = "bf6cd63f-c399-4d3c-905c-04ab563e8949";
  const requests: Array<{
    puzzleCorrect: boolean;
    attempt: { runId: string | null; pgn: string };
  }> = [];
  let solved = false;
  const grading = () => ({
    runId: requests.length && !solved ? runId : null,
    graded: !solved,
    availableAt: solved ? "2099-01-01T00:00:00Z" : null,
    permanent: false,
    hasAttempted: requests.length > 0,
    hasSolved: solved,
    misses: requests.length && !solved ? 1 : 0,
    color: requests.length ? (solved ? "yellow" : "red") : null,
  });
  await page.route("**/api/puzzles/play", (route) =>
    route.fulfill({
      json: {
        puzzles: [
          {
            id: 102,
            author: "another-player",
            fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
            solution: "1... e5 2. Nf3 Nc6",
            explanation: "Play e5 followed by Nc6.",
          },
        ],
      },
    }),
  );
  await page.route("**/api/puzzles/progress", (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "gradingState") return route.fulfill({ json: grading() });
    requests.push(body);
    solved = body.puzzleCorrect;
    return route.fulfill({
      json: {
        coinDelta: solved ? 1.5 : -1.5,
        rated: !solved,
        graded: true,
        ratingEvent: null,
        unratedUntil: grading().availableAt,
        grading: grading(),
      },
    });
  });
  await page.route("**/__e2e_supabase/rest/v1/puzzle_progress?**", (route) =>
    route.fulfill({
      json: requests.length
        ? [
            {
              username: "e2e-player",
              puzzle_id: "102",
              first_attempt_at: "2026-07-09T09:55:47Z",
              first_attempt_duration_ms: 30000,
              puzzle_correct: false,
              rated: true,
              incorrect_move: "1... a6",
              has_solved: solved,
              attempt_color: solved ? "yellow" : "red",
            },
          ]
        : [],
    }),
  );
  await page.goto("/solve/102");
  await playBlackMove(page, "a7a6");
  await expect(page.getByText("-1.5 coins", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Explanation", exact: true })).toBeDisabled();
  await expect(page.getByRole("tab", { name: "Other attempts", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Resign and reveal the solution" })).toBeEnabled();
  await playBlackMove(page, "e7e5");
  await expect(
    page.getByRole("region", { name: "Puzzle analysis" }).getByRole("button", { name: /Nf3/ }),
  ).toHaveAttribute("aria-current", "step");
  await playBlackMove(page, "b8c6");
  await expect(page.getByText("+1.5 coins", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]?.puzzleCorrect).toBe(false);
  expect(requests[1]?.puzzleCorrect).toBe(true);
  expect(requests[1]?.attempt.runId).toBe(runId);
  expect(requests[1]?.attempt.pgn).toContain("Nc6");
  await expect(page.getByRole("tab", { name: "Explanation", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "Other attempts", exact: true }).click();
  await expect(page.getByLabel("Played 1... a6")).toBeVisible();
  await expect(page.getByLabel("Attempt time 0:30")).toBeVisible();
  await expect(page.getByLabel("Solved on the second try", { exact: true })).toBeVisible();
});

test("a previously solved puzzle permits confirmed resignation before a move", async ({ page }) => {
  const writes: Array<{ puzzleCorrect: boolean; attempt: { resigned?: boolean } }> = [];
  let availableAt = "2099-01-01T00:00:00Z";
  const state = () => ({
    runId: null,
    graded: false,
    availableAt,
    permanent: false,
    hasAttempted: true,
    hasSolved: true,
    misses: 0,
    color: "green",
  });
  await page.route("**/api/puzzles/progress", (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "gradingState") return route.fulfill({ json: state() });
    writes.push(body);
    availableAt = "2099-02-01T00:00:00Z";
    return route.fulfill({
      json: {
        coinDelta: 0,
        rated: false,
        graded: false,
        ratingEvent: null,
        unratedUntil: availableAt,
        grading: state(),
      },
    });
  });
  await page.route("**/__e2e_supabase/rest/v1/puzzle_progress?**", (route) =>
    route.fulfill({
      json: [
        {
          username: "e2e-player",
          puzzle_id: "102",
          first_attempt_at: "2026-03-01T00:00:00Z",
          first_attempt_duration_ms: 42000,
          puzzle_correct: true,
          has_solved: true,
          rated: true,
          correct_move: "1... e5",
          incorrect_move: null,
          attempt_color: "green",
          grading_available_at: availableAt,
        },
      ],
    }),
  );
  await page.goto("/solve/102");
  const resign = page.getByRole("button", { name: "Resign and reveal the solution" });
  await expect(resign).toBeEnabled();
  await expect(page.getByRole("tab", { name: "Other attempts", exact: true })).toBeDisabled();
  const eligibility = page.getByText(/^Grading returns in/);
  const previousEligibility = await eligibility.innerText();
  await resign.click();
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: "Confirm resignation" }).click();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]?.attempt.resigned).toBe(true);
  expect(writes[0]?.puzzleCorrect).toBe(false);
  await expect(page.getByRole("tab", { name: "Other attempts", exact: true })).toBeEnabled();
  await expect(eligibility).not.toHaveText(previousEligibility);
  await expect(page.getByText(/^Grading returns in/)).toHaveAttribute(
    "aria-description",
    /Graded attempts/,
  );
});
