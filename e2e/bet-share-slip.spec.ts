import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { expect, test } from "./fixtures";

test("share slips vary between openings, remain stable while open, and export their preview", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let seed = 123456;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Rebound to the canvas context with apply below.
    const original = CanvasRenderingContext2D.prototype.createLinearGradient;
    CanvasRenderingContext2D.prototype.createLinearGradient = function (...coordinates) {
      if (this.canvas.getAttribute("role") === "img") {
        this.canvas.dataset.frame = coordinates.join(",");
      }
      return original.apply(this, coordinates);
    };
  });
  const marketId = "awc2026-final";
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => socket.close());
  await page.route("**/api/betting", (route) => {
    const { action } = route.request().postDataJSON();
    if (action === "exchangeMarkets")
      return route.fulfill({
        json: {
          result: [
            {
              id: marketId,
              group_id: "awc-2026-finals",
              group_path: "/betting/awc-2026-finals",
              group_title: "AWC Finals",
              group_description: "",
              group_order: 1,
              display_name: "crepuscular vs natso",
              country_code: "",
              starting_chance: 30,
              display_order: 1,
              outcome_yes_label: "crepuscular",
              outcome_no_label: "natso",
              outcome_yes_country_code: null,
              outcome_no_country_code: null,
            },
          ],
        },
      });
    if (action === "predictionPositions")
      return route.fulfill({
        json: {
          result: [
            {
              market_id: marketId,
              username: "e2e-player",
              outcome: "yes",
              quantity: 1000,
              reserved_quantity: 0,
              average_price_cents: 30,
              updated_at: "2026-11-01T00:00:00Z",
            },
          ],
        },
      });
    if (action === "exchangeMarketBatch")
      return route.fulfill({
        json: {
          result: [
            {
              market: {
                id: marketId,
                question: "Will crepuscular win the AWC final?",
                resolution_rules: "Official AWC results.",
                resolution_source_url: "https://lichess.org/team/atomic-wc",
                closes_at: "2099-12-31T00:00:00Z",
                status: "open",
                outcome: null,
                resolved_at: null,
                settlement_price_cents: null,
                settlement_reference_fill_id: null,
              },
              book: { yes: { asks: [], bids: [] }, no: { asks: [], bids: [] } },
              fills: [],
              positions: [],
              orders: [],
            },
          ],
        },
      });
    return route.fulfill({ status: 400, json: { error: "Unexpected fixture request" } });
  });
  await page.goto("/betting?view=mine");
  const trigger = page.getByRole("button", {
    name: "Share bet on crepuscular by e2e-player",
    exact: true,
  });
  const dialog = page.getByRole("dialog", { name: "Share bet", exact: true });
  const image = dialog.getByRole("img");
  const download = dialog.getByRole("button", { name: "Download image", exact: true });
  const frames = new Map<string, string>();
  for (let attempt = 0; attempt < 64 && frames.size < 8; attempt++) {
    await trigger.click();
    await expect(download).toBeEnabled();
    await expect(image).toBeVisible();
    const frame = await image.getAttribute("data-frame");
    expect(frame).not.toBeNull();
    const preview = await image.evaluate((canvas: HTMLCanvasElement) =>
      canvas.toDataURL("image/png"),
    );
    const hash = createHash("sha256")
      .update(Buffer.from(preview.split(",")[1]!, "base64"))
      .digest("hex");
    if (frames.has(frame!)) expect(hash).toBe(frames.get(frame!));
    frames.set(frame!, hash);
    if (attempt === 0) {
      const downloaded = page.waitForEvent("download");
      await download.click();
      const file = await downloaded;
      expect(file.suggestedFilename()).toMatch(/\.png$/);
      expect(
        createHash("sha256")
          .update(await readFile((await file.path())!))
          .digest("hex"),
      ).toBe(hash);
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(dialog).toBeInViewport();
      await expect(download).toBeInViewport();
      expect(
        await image.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL("image/png")),
      ).toBe(preview);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
  expect(frames.size).toBe(8);
  expect(new Set(frames.values()).size).toBe(8);
});
