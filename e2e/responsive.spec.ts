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

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
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
