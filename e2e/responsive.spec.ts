import { expect, test } from "./fixtures";

test("mobile navigation opens and reaches rankings", async ({ page }) => {
  await page.goto("/");

  const menuButton = page.locator(".mobileMenuButton");
  await expect(menuButton).toBeVisible();
  await expect(menuButton).toHaveAccessibleName("Open navigation menu");
  await menuButton.click();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");
  await expect(menuButton).toHaveAccessibleName("Close navigation menu");
  await page.getByRole("button", { name: "Rankings", exact: true }).click();
  await page.getByRole("menuitem", { name: "Monthly rankings", exact: true }).click();
  await expect(page).toHaveURL(/\/rankings/);
});

test("home page does not overflow a mobile viewport", async ({ page }) => {
  await page.goto("/");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});

test("puzzle solver keeps its primary controls within the mobile viewport", async ({ page }) => {
  await page.goto("/solve/101");
  await expect(page.locator(".cg-board")).toBeVisible();
  await expect(page.getByLabel("Puzzle navigation").last()).toBeVisible();
  await expect(page.getByLabel("Puzzle 101", { exact: true })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});

test("puzzle number fits the iPhone 17 and iPhone SE layouts", async ({ page }) => {
  let puzzleIsSolved = false;

  await page.route("**/__e2e_supabase/rest/v1/rpc/get_puzzle_progress_page_v3", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        puzzleIsSolved
          ? [
              {
                puzzle_id: "101",
                first_attempt_at: "2026-11-04T08:00:00.000Z",
                first_attempt_duration_ms: 14_000,
                puzzle_correct: true,
                rated: true,
                incorrect_move: null,
                correct_move: "e4",
                total_count: 1,
              },
            ]
          : [],
      ),
    }),
  );

  for (const viewport of [
    { width: 402, height: 874 },
    { width: 375, height: 667 },
  ]) {
    for (const solved of [false, true]) {
      puzzleIsSolved = solved;
      await page.setViewportSize(viewport);
      await page.goto("/solve/101");

      const puzzleNumber = page.getByLabel("Puzzle 101", { exact: true });
      await expect(puzzleNumber).toBeVisible();
      await expect(page.locator(".mobileWorkflowPanel")).toBeVisible({ visible: solved });

      const layout = await page.evaluate(() => {
        const status = document.querySelector(".mobilePuzzleStatus")?.getBoundingClientRect();
        const number = document.querySelector(".mobilePuzzleNumber")?.getBoundingClientRect();
        const navigation = document.querySelector(".mobileBottomNav")?.getBoundingClientRect();
        return {
          clientWidth: document.documentElement.clientWidth,
          viewportHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          numberLeft: number?.left ?? -1,
          numberRight: number?.right ?? Number.POSITIVE_INFINITY,
          statusLeft: status?.left ?? 0,
          statusRight: status?.right ?? 0,
          navigationLeft: navigation?.left ?? -1,
          navigationRight: navigation?.right ?? Number.POSITIVE_INFINITY,
          navigationBottom: navigation?.bottom ?? Number.POSITIVE_INFINITY,
        };
      });

      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
      expect(layout.numberLeft).toBeGreaterThanOrEqual(layout.statusLeft);
      expect(layout.numberRight).toBeLessThanOrEqual(layout.statusRight);
      expect(layout.navigationLeft).toBeGreaterThanOrEqual(0);
      expect(layout.navigationRight).toBeLessThanOrEqual(layout.clientWidth);
      expect(layout.navigationBottom).toBeLessThanOrEqual(layout.viewportHeight);
    }
  }
});

test("puzzle solver uses the compact mobile layout on a wide phone in landscape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 932, height: 430 });
  await page.goto("/solve/101");
  await expect(page.locator(".cg-board")).toBeVisible();
  await expect(page.locator(".mobilePuzzleStatus")).toBeVisible();
  await expect(page.getByLabel("Puzzle navigation").last()).toBeVisible();

  const layout = await page.evaluate(() => {
    const board = document.querySelector(".boardFrame")?.getBoundingClientRect();
    const controls = document.querySelector(".mobileBottomNav")?.getBoundingClientRect();
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      boardRight: board?.right ?? 0,
      controlsLeft: controls?.left ?? 0,
      controlsRight: controls?.right ?? Number.POSITIVE_INFINITY,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.controlsLeft).toBeGreaterThanOrEqual(layout.boardRight);
  expect(layout.controlsRight).toBeLessThanOrEqual(layout.clientWidth);
});

test("puzzle feedback outline stays evenly anchored to the board", async ({ page }) => {
  const viewports = [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
    { width: 932, height: 430 },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/solve/101");
    await expect(page.locator(".cg-board")).toBeVisible();

    const geometry = await page.locator(".boardFrame").evaluate((frame) => {
      frame.classList.add("hasFeedback", "correct");
      const shell = frame.querySelector<HTMLElement>(".cg-boardShell");
      const board = frame.querySelector<HTMLElement>(".cg-board");
      const stage = frame.querySelector<HTMLElement>(".boardStage");
      if (!shell || !board || !stage) return null;

      const shellRect = shell.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      return {
        shellOutline: getComputedStyle(shell).outlineStyle,
        stageOutline: getComputedStyle(stage).outlineStyle,
        shellRatioDifference: Math.abs(shellRect.width - shellRect.height),
        edgeDifferences: [
          Math.abs(boardRect.left - shellRect.left),
          Math.abs(boardRect.top - shellRect.top),
          Math.abs(boardRect.right - shellRect.right),
          Math.abs(boardRect.bottom - shellRect.bottom),
        ],
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry?.shellOutline).toBe("solid");
    expect(geometry?.stageOutline).toBe("none");
    expect(geometry?.shellRatioDifference).toBeLessThanOrEqual(0.5);
    expect(Math.max(...(geometry?.edgeDifferences ?? []))).toBeLessThanOrEqual(0.5);
  }
});

for (const path of ["/analysis", "/practice"] as const) {
  test(`${path} light mode stays within the mobile viewport`, async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("atomic-puzzles.theme", JSON.stringify("light"));
    });
    await page.goto(path);
    await expect(page.locator(".cg-board")).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  });
}
