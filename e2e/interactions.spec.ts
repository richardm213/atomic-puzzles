import { expect, test } from "./fixtures";

test("bracket dates default off, persist when enabled, and never hide upcoming schedules", async ({
  page,
}) => {
  await page.route("**/rest/v1/tournament_matches?**", (route) =>
    route.fulfill({
      json: [
        {
          id: "played-semi",
          tournament: "awc2026",
          bracket: "main",
          round: "Semifinals",
          order: 1,
          p1: "alpha",
          p2: "beta",
          s1: 6,
          s2: 2,
          played_on: "2026-10-15",
        },
        {
          id: "scheduled-semi",
          tournament: "awc2026",
          bracket: "main",
          round: "Semifinals",
          order: 2,
          p1: "gamma",
          p2: "delta",
          s1: 0,
          s2: 0,
          scheduled_at: "2099-11-08T19:00:00Z",
        },
      ],
    }),
  );
  await page.goto("/tournaments/awc2026");
  const setting = page.getByRole("checkbox", { name: "Show dates" });
  const playedDate = page.locator('time[datetime="2026-10-15"]');
  const schedule = page.locator('time[datetime="2099-11-08T19:00:00Z"]');
  await expect(setting).not.toBeChecked();
  await expect(playedDate).toHaveCount(0);
  await expect(schedule).toBeVisible();
  await setting.check();
  await expect(playedDate).toBeVisible();
  await page.reload();
  await expect(setting).toBeChecked();
  await expect(playedDate).toBeVisible();
  await setting.uncheck();
  await expect(playedDate).toHaveCount(0);
  await expect(schedule).toBeVisible();
});

test("head-to-head search encodes both players in the route", async ({ page }) => {
  await page.goto("/h2h");
  await page.getByLabel("Player 1").fill("Alpha_Player");
  await page.getByLabel("Player 2").fill("Beta_Player");
  await page.getByRole("button", { name: "Compare" }).click();

  await expect(page).toHaveURL(/\/h2h\/alpha_player-vs-beta_player$/);
});

test("puzzle next and previous controls update the route", async ({ page }) => {
  await page.goto("/solve/101");

  const previous = page.getByRole("button", { name: /Previous/ }).first();
  const next = page.getByRole("button", { name: /Next/ }).first();
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();

  await next.click();
  await expect(page).toHaveURL(/\/solve\/102$/);
  await expect(page.getByRole("button", { name: /Previous/ }).first()).toBeEnabled();
});

test("piece selection and legal moves keep Default's markers across site themes", async ({
  page,
}) => {
  const fen = "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1";
  await page.goto(`/analysis/${encodeURIComponent(fen)}`);
  const board = page.locator("cg-board");
  await expect(board.locator("piece.white.pawn")).toBeVisible();
  const bounds = await board.boundingBox();
  if (!bounds) throw new Error("Analysis board is missing");
  await page.mouse.click(bounds.x + (bounds.width * 4.5) / 8, bounds.y + (bounds.height * 4.5) / 8);
  await expect(board.locator("square.selected")).toBeVisible();
  await expect(board.locator("square.move-dest:not(.oc)")).toBeVisible();
  await expect(board.locator("square.move-dest.oc")).toBeVisible();
  const markers = () =>
    board.evaluate((element) => {
      const selected = getComputedStyle(element.querySelector("square.selected")!);
      return {
        selected: selected.backgroundColor,
        outline: selected.boxShadow,
        move: getComputedStyle(element.querySelector("square.move-dest:not(.oc)")!).backgroundImage,
        capture: getComputedStyle(element.querySelector("square.move-dest.oc")!).backgroundImage,
      };
    });
  const baseline = await markers();
  expect(baseline.move).not.toBe("none");
  expect(baseline.capture).not.toBe("none");
  // Gemstone palettes share one recipe; Black has its own palette overrides.
  for (const palette of ["ruby", "black"]) {
    await page.evaluate((palette) => {
      const root = document.documentElement;
      root.dataset.palette = palette;
      root.toggleAttribute("data-gemstone-theme", palette === "ruby");
    }, palette);
    await expect.poll(markers).toEqual(baseline);
  }
});

test("board resizing supports dragging, keyboard adjustment, saved size, and reset", async ({
  page,
}) => {
  await page.goto("/analysis");
  const board = page.locator(".cg-boardShell:visible");
  const grip = page.getByRole("button", { name: "Resize board", exact: true });
  await expect(grip).toBeVisible();
  const original = (await board.boundingBox())!.width;
  const corner = (await grip.boundingBox())!;
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await page.mouse.down();
  await page.mouse.move(corner.x + corner.width / 2 - 100, corner.y + corner.height / 2 - 100, {
    steps: 5,
  });
  await page.mouse.up();
  await expect.poll(async () => (await board.boundingBox())!.width).toBeLessThan(original - 50);
  const dragged = (await board.boundingBox())!.width;
  await grip.focus();
  await grip.press("Shift+ArrowRight");
  await expect.poll(async () => (await board.boundingBox())!.width).toBeGreaterThan(dragged + 20);
  const resized = (await board.boundingBox())!.width;
  await page.reload();
  await expect.poll(async () => (await board.boundingBox())!.width).toBeCloseTo(resized, 0);
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await page.getByRole("button", { name: "Board settings", exact: true }).click();
  await page.getByRole("button", { name: "Reset size", exact: true }).click();
  await expect.poll(async () => (await board.boundingBox())!.width).toBeCloseTo(original, 0);
  await page.reload();
  await expect.poll(async () => (await board.boundingBox())!.width).toBeCloseTo(original, 0);
});
