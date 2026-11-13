import { INITIAL_FEN } from "chessops/fen";

import { openingCards, scheduleOpeningReview } from "../shared/domain/openings/repertoire";
import type { OpeningCopy } from "../src/lib/openings/api";
import { expect, test } from "./fixtures";

test("builds a repertoire, saves it, and trains a branch without replaying its prefix", async ({
  page,
}) => {
  let copy: OpeningCopy | null = null;
  await page.route("**/api/openings", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "list") return route.fulfill({ json: { result: copy ? [copy] : [] } });
    if (body.action === "catalog")
      return route.fulfill({
        json: {
          result: copy?.listing
            ? [
                {
                  id: copy.listing.id,
                  title: copy.title,
                  description: copy.description,
                  author: copy.owner,
                  price: copy.listing.price,
                  version: 1,
                  line_count: copy.document.lines.length,
                },
              ]
            : [],
        },
      });
    if (body.action === "publish")
      copy = {
        ...copy!,
        listing: { id: "4b648b2a-e2bf-49dc-aaed-235c05615d1b", price: body.price, version: 1 },
      };
    if (body.action === "create")
      copy = {
        id: body.id,
        owner: "e2e-player",
        title: body.title,
        description: body.description,
        document: body.document,
        progress: {},
        revision: 1,
        source_listing_id: null,
        source_version: null,
        source: null,
        listing: null,
        update_available: false,
      };
    if (body.action === "save")
      copy = {
        ...copy!,
        document: body.document,
        title: body.title,
        description: body.description,
        revision: copy!.revision + 1,
      };
    if (body.action === "review") {
      const card = openingCards(copy!.document).find((c) => c.key === body.card)!;
      copy = {
        ...copy!,
        progress: {
          ...copy!.progress,
          [card.key]: scheduleOpeningReview(
            copy!.progress[card.key],
            card.move === body.move,
            Date.now(),
          ),
        },
      };
    }
    return route.fulfill({ json: { result: copy } });
  });
  const play = async (from: string, to: string) => {
    const board = page.locator("cg-board:visible");
    await board.scrollIntoViewIfNeeded();
    const bounds = (await board.boundingBox())!;
    for (const [index, square] of [from, to].entries()) {
      await page.mouse.click(
        bounds.x + ((square.charCodeAt(0) - 97 + 0.5) * bounds.width) / 8,
        bounds.y + ((8 - Number(square[1]) + 0.5) * bounds.height) / 8,
      );
      if (!index) await expect(board.locator("square.selected")).toBeVisible();
    }
  };
  await page.addInitScript(() =>
    localStorage.setItem(
      "atomic-puzzles.practice.settings",
      JSON.stringify({ opponentMode: "popular" }),
    ),
  );
  await page.route("**/api/opening-explorer?**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("randomPlayer"))
      return route.fulfill({ json: { username: "TestOpponent" } });
    const afterE4 =
      url.searchParams.get("fen")?.includes("/4P3/") &&
      url.searchParams.get("fen")?.includes(" b ");
    return route.fulfill({
      json: {
        moves: afterE4
          ? [
              {
                uci: "c7c5",
                games: 10,
                whiteWins: 5,
                draws: 0,
                blackWins: 5,
                avgOpponentRating: null,
              },
              {
                uci: "e7e5",
                games: 5,
                whiteWins: 3,
                draws: 0,
                blackWins: 2,
                avgOpponentRating: null,
              },
            ]
          : [],
        recentGames: [],
      },
    });
  });
  await page.goto("/openings");
  await page.getByRole("button", { name: "New opening", exact: true }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Test repertoire");
  await page.getByRole("button", { name: "Create opening", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Toggle position analysis", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit puzzle", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /opening explorer/ })).toBeVisible();
  const pgn = page.getByRole("textbox", { name: "PGN", exact: true });
  await pgn.fill("1. e4 e5 2. Nf3 (2. Nc3)");
  await pgn.press("Enter");
  const tree = page.getByLabel("Repertoire tree", { exact: true });
  await expect(tree.getByRole("button", { name: /Nc3$/ })).toBeVisible();
  await expect(
    page
      .getByLabel("Analysis controls", { exact: true })
      .getByRole("list", { name: "Analysis variations" })
      .getByRole("button", { name: /Nc3$/ }),
  ).toHaveCount(0);
  await tree.getByRole("button", { name: /Nc3$/ }).click({ button: "right" });
  await page.getByRole("menuitemcheckbox", { name: "Tertiary", exact: true }).click();
  await tree.getByRole("checkbox", { name: "Essential only", exact: true }).check();
  await expect(tree.getByRole("button", { name: /Nc3$/ })).toHaveCount(0);
  await tree.getByRole("checkbox", { name: "Essential only", exact: true }).uncheck();
  await tree.getByRole("button", { name: /Nc3$/ }).click({ button: "right" });
  await page.getByRole("menuitemcheckbox", { name: "Essential", exact: true }).click();
  await tree.getByRole("button", { name: "1. e4", exact: true }).click();
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("1. e4");
  await page.keyboard.press("ArrowRight");
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("1... e5");
  await page.keyboard.press("ArrowRight");
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("2. Nf3");
  await page.keyboard.press("ArrowDown");
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("2. Nc3");
  await page.keyboard.press("ArrowLeft");
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("1... e5");
  await tree
    .getByRole("group", { name: "Choose continuation", exact: true })
    .getByRole("button", { name: "Next continuation", exact: true })
    .click();
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("2. Nc3");
  await page.keyboard.press("ArrowUp");
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("2. Nf3");
  await page.keyboard.press("ArrowLeft");
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("1... e5");
  const rightPanel = page.getByLabel("Analysis controls", { exact: true });
  await rightPanel.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("1. e4");
  await page.keyboard.press("ArrowRight");
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("1... e5");
  // Both visited branches survive rewinding and remain available in the right panel.
  await page.keyboard.press("ArrowRight");
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("2. Nf3");
  await expect(
    rightPanel
      .getByRole("list", { name: "Analysis variations" })
      .getByRole("button", { name: /Nf3$/ }),
  ).toBeVisible();
  await expect(
    rightPanel
      .getByRole("list", { name: "Analysis variations" })
      .getByRole("button", { name: /Nc3$/ }),
  ).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("1... e5");
  await expect(
    rightPanel
      .getByRole("list", { name: "Analysis variations" })
      .getByRole("button", { name: /Nc3$/ }),
  ).toBeVisible();
  await expect(rightPanel).toBeFocused();
  await tree.getByRole("button", { name: "1... e5", exact: true }).click();
  await tree
    .getByRole("group", { name: "Choose continuation", exact: true })
    .getByRole("button", { name: /Nc3$/ })
    .click();
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("2. Nc3");
  await expect(tree.getByRole("group", { name: "Choose continuation", exact: true })).toHaveCount(
    0,
  );
  await expect(
    page
      .getByLabel("Analysis controls", { exact: true })
      .getByRole("list", { name: "Analysis variations" })
      .getByRole("button", { name: /Nc3$/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "FEN", exact: true })).toHaveValue(INITIAL_FEN);
  await expect(
    rightPanel
      .getByRole("list", { name: "Analysis variations" })
      .getByRole("button", { name: /Nf3$/ }),
  ).toBeVisible();
  await expect(
    rightPanel
      .getByRole("list", { name: "Analysis variations" })
      .getByRole("button", { name: /Nc3$/ }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(tree.locator("button[aria-current='step']")).toHaveAccessibleName("1. e4");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("textbox", { name: "FEN", exact: true })).toHaveValue(INITIAL_FEN);
  await expect(page.getByRole("button", { name: "Discover", exact: true })).toHaveCount(0);
  await expect.poll(() => copy?.document.lines.length).toBe(2);
  await play("d2", "d4");
  await expect(page.getByRole("textbox", { name: "FEN", exact: true })).toHaveValue(/3P4/);
  expect(copy!.document.lines).toHaveLength(2);
  await expect(pgn).not.toHaveValue(/d4/);
  await play("d7", "d5");
  await rightPanel.getByRole("button", { name: /d4$/ }).click();
  await expect(page.getByRole("textbox", { name: "FEN", exact: true })).toHaveValue(/3P4\/8\/PPP/);
  expect(copy!.document.lines).toHaveLength(2);
  await page
    .getByLabel("Analysis controls", { exact: true })
    .getByRole("button", { name: /d5$/ })
    .click({ button: "right" });
  await page.getByRole("menuitemcheckbox", { name: "Add mating line", exact: true }).click();
  await expect
    .poll(() => copy?.document.lines.find((line) => line.kind === "mate")?.moves)
    .toEqual(["d2d4", "d7d5"]);
  await tree.getByRole("button", { name: "1. e4", exact: true }).click();
  await page.getByRole("button", { name: "Start opponent practice", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "FEN", exact: true })).toHaveValue(/2p5/);
  await page.getByRole("button", { name: "Choose a different opponent move", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "FEN", exact: true })).toHaveValue(/4p3/);
  await page.getByRole("button", { name: "Pause opponent practice", exact: true }).click();
  await page.getByRole("button", { name: "Practice a random opponent", exact: true }).click();
  await expect(page.getByRole("tab", { name: /TestOpponent/ })).toBeVisible();
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.getByRole("button", { name: "Submit puzzle", exact: true }).click();
  const composer = page.getByRole("form", { name: "Puzzle draft" });
  await expect(composer).toBeVisible();
  await composer.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(composer).not.toBeVisible();
  await expect(page).toHaveURL(/\/openings\?opening=/);
  await page.getByRole("button", { name: "Practice", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Toggle position analysis", exact: true }),
  ).not.toBeVisible();
  await expect(page.locator(".openingUnderboard").getByRole("status")).toContainText(
    "Your move as white",
  );
  await play("e2", "e4");
  await expect.poll(() => copy && Object.keys(copy.progress).length).toBe(1);
  await expect(page.getByRole("textbox", { name: "FEN", exact: true })).toHaveValue(
    /^rnbqkbnr\/pppp1ppp\/8\/4p3\/4P3/,
  );
  await expect(page.getByText("2 moves due", { exact: true })).toBeVisible();
  await expect(page.locator(".openingUnderboard").getByRole("status")).toContainText("Your move");
  await play("g1", "f3");
  await expect.poll(() => copy && Object.keys(copy.progress).length).toBe(2);
  // The second alternative begins at the same branch position, not at the root.
  await expect(page.getByRole("textbox", { name: "FEN", exact: true })).toHaveValue(
    /^rnbqkbnr\/pppp1ppp\/8\/4p3\/4P3/,
  );
  await expect(page.getByText("1 moves due", { exact: true })).toBeVisible();
  await expect(page.locator(".openingUnderboard").getByRole("status")).toContainText("Your move");
  await play("b1", "c3");
  await expect.poll(() => copy && Object.keys(copy.progress).length).toBe(3);
  await expect(page.locator(".openingUnderboard").getByRole("status")).toContainText("Caught up");
  expect(copy!.document.startFen).toBe(INITIAL_FEN);
  await page.getByRole("button", { name: "Practice", exact: true, pressed: true }).click();
  await expect(page.getByRole("button", { name: "Practice", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page.getByRole("button", { name: "Publish · 50 coins", exact: true }).click();
  const dialog = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("heading", { name: "Publish this opening?", exact: true }) });
  await expect(dialog).toContainText("Publishing costs 50 coins");
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Close opening settings", exact: true }).click();
  await tree.getByRole("checkbox", { name: "Essential only", exact: true }).check();
  await page.route("**/api/coins", (route) =>
    route.fulfill({
      json: {
        result:
          route.request().postDataJSON().action === "summary"
            ? { balance: 950, dailyClaimAvailable: false }
            : [],
      },
    }),
  );
  await page.goto("/shop");
  await page
    .getByRole("group", { name: "Shop category" })
    .getByRole("button", { name: "Openings", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Test repertoire", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Open your copy", exact: true }).click();
  await expect(page).toHaveURL(new RegExp("opening=" + copy!.id));
  await page.goto("/openings");
  await expect(page).toHaveURL(new RegExp("opening=" + copy!.id));
  await expect(tree.getByRole("checkbox", { name: "Essential only", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "General", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(
    "Test repertoire",
  );
});
