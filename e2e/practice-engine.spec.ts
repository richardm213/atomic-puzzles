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
