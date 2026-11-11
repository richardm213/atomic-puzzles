import { expect, test } from "./fixtures";

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
        coinDelta: ended ? 0 : -Math.pow(0.5, misses - 1),
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
          ]
        : [],
    }),
  );
  const playBlackMove = async (uci: string) => {
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
  await page.goto("/solve/102");
  await expect(page.locator("cg-board")).toBeVisible();
  await expect(page.getByRole("button", { name: "Resign and reveal the solution" })).toHaveCount(0);
  await expect(page.getByText("Graded", { exact: true })).toHaveCount(0);
  await playBlackMove("a7a6");
  await expect.poll(() => requests.length).toBe(1);
  await expect(page.getByRole("button", { name: "Resign and reveal the solution" })).toBeEnabled();
  await expect(page.getByText("Graded", { exact: true })).toHaveCount(0);

  await expect(page.getByRole("tab", { name: "Other attempts", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.getByText("Graded", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resign and reveal the solution" })).toBeEnabled();
  await playBlackMove("b7b6");
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
});
