import { readFileSync } from "node:fs";

import { expect, test } from "./fixtures";

test("practice plays the engine fallback move when the databases have no move", async ({
  page,
}) => {
  await page.route("**/api/opening-explorer?**", (route) =>
    route.fulfill({ json: { moves: [], recentGames: [] } }),
  );
  await page.route("**/api/atomicdb-analysis?**", (route) =>
    route.fulfill({ status: 404, json: { code: "position_not_found" } }),
  );
  // Exercise the real browser worker connection and board playback without fetching the hosted NNUE.
  await page.route("**/engines/atomic-stockfish/*/atomic-stockfish.worker.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      headers: { "cross-origin-embedder-policy": "require-corp" },
      body: `
        const line = (line) => self.postMessage({ type: "line", line });
        let fen = "";
        self.onmessage = ({ data }) => {
          if (data.type === "initialize") self.postMessage({ type: "ready" });
          if (data.type !== "command") return;
          const command = data.command;
          if (command === "isready") line("readyok");
          if (command.startsWith("position fen ")) fen = command.slice(13);
          if (command.startsWith("go ")) {
            if (!fen.startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w ")) {
              line("bestmove (none)");
              return;
            }
            line("info depth 15 multipv 1 score cp 20 pv e2e4");
            line("bestmove e2e4");
          }
        };
      `,
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "atomic-puzzles.practice.settings",
      JSON.stringify({ side: "black", clockEnabled: false }),
    );
  });

  const response = await page.goto("/practice");
  expect(response?.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(response?.headers()["cross-origin-embedder-policy"]).toBe("require-corp");
  // Netlify must ship the same browser-compatible isolation policy as the local preview.
  const productionHeaders = readFileSync("public/_headers", "utf8");
  expect(productionHeaders).toContain("Cross-Origin-Opener-Policy: same-origin");
  expect(productionHeaders).toContain("Cross-Origin-Embedder-Policy: require-corp");
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe("function");

  await page.getByRole("button", { name: "Start game", exact: true }).click();
  // The exported FEN proves the worker's move actually reached the board.
  await expect(page.getByRole("textbox", { name: "FEN", exact: true })).toHaveValue(
    /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b /,
  );
});

test("practice keeps its PGN and position when creating puzzles or changing opponents", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const submissions: unknown[] = [];
  await page.route("**/api/opening-explorer?**", (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.has("randomPlayer")
        ? { username: "random-player" }
        : { moves: [], recentGames: [] },
    }),
  );
  await page.route("**/api/puzzles/submit", (route) => {
    const input = route.request().postDataJSON();
    if (input.action === "starting-fen-match") return route.fulfill({ json: { puzzleId: null } });
    submissions.push(input);
    return route.fulfill({ json: { destination: "review", puzzle: { id: 42 } } });
  });

  await page.goto("/practice");
  const pgn = page.getByRole("textbox", { name: "PGN", exact: true });
  const fen = page.getByRole("textbox", { name: "FEN", exact: true });
  const importPgn = async (text: string) => {
    await pgn.fill(text);
    await pgn.press("Enter");
  };
  await importPgn("1. e4 (1. d4 d5) e5 2. Nf3");
  const moves = page.getByRole("region", { name: "Position analysis and played moves" });
  await moves.getByRole("button", { name: "1. e4", exact: true }).click();
  await expect(fen).toHaveValue(/4P3.* b /);
  const savedPgn = await pgn.inputValue();
  const savedFen = await fen.inputValue();

  const launcher = page
    .getByLabel("Position analysis controls", { exact: true })
    .getByRole("button", { name: "Submit puzzle", exact: true });
  const composer = moves.getByRole("form", { name: "Puzzle draft" });
  await launcher.click();
  await expect(page).toHaveURL(/\?puzzle=1#ply-0$/);
  await importPgn("1... c5");
  await composer.getByRole("button", { name: "Cancel" }).click();
  await expect(launcher).toBeFocused();
  await expect(pgn).toHaveValue(savedPgn);
  await expect(fen).toHaveValue(savedFen);
  expect(submissions).toHaveLength(0);

  await launcher.click();
  await composer.getByRole("checkbox", { name: "OPA style" }).check();
  await composer
    .getByRole("textbox", { name: "Explanation", exact: true })
    .fill("Challenge the center.");
  await composer.getByRole("button", { name: "Add tag", exact: true }).click();
  await composer.getByRole("searchbox", { name: "Search tags to add" }).fill("fork");
  await composer.getByRole("button", { name: "Add Fork", exact: true }).click();
  await importPgn("1... c5");
  await expect(page).toHaveURL(/\?puzzle=1#ply-1$/);
  await composer.getByRole("button", { name: "Submit puzzle" }).click();
  await expect(page.getByText("Puzzle submitted for review.")).toBeVisible();
  expect(submissions).toEqual([
    expect.objectContaining({
      fen: savedFen,
      solution: "1... c5",
      explanation: "Challenge the center.",
      opaStyle: true,
      tags: ["fork"],
    }),
  ]);
  await expect(pgn).toHaveValue(savedPgn);
  await expect(fen).toHaveValue(savedFen);

  await page.getByRole("button", { name: "Practice a random opponent" }).click();
  await expect(page).toHaveURL(/\/practice\/random-player$/);
  await page.reload();
  await expect(pgn).toHaveValue(savedPgn);
  await expect(fen).toHaveValue(savedFen);
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await expect(pgn).not.toHaveValue(/\be4\b|\bd4\b/);
  await page.reload();
  await expect(pgn).not.toHaveValue(/\be4\b|\bd4\b/);
});
