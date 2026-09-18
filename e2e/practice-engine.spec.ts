import { readFileSync } from "node:fs";

import { expect, test } from "./fixtures";

test("practice plays a real engine move when the opening database is exhausted", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.route("**/api/opening-explorer?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ moves: [], recentGames: [], positionLeaders: null }),
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "atomic-puzzles.practice.settings",
      JSON.stringify({ side: "black", clockEnabled: false, playerContinuation: "stockfish" }),
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

  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByRole("region", { name: "Played moves", exact: true })).toContainText(
    "1/1",
    { timeout: 25_000 },
  );
  await expect(page.getByText("Fairy-Stockfish requires cross-origin isolation")).toHaveCount(0);
});
