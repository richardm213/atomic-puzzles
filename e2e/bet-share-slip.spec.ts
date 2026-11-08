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
  await page.route("**/api/betting", (route) => {
    const { action } = route.request().postDataJSON();
    const bet = {
      id: 1,
      market_id: marketId,
      username: "e2e-player",
      selection: "crepuscular",
      price_cents: 30,
      stake: 300,
      fee: 6,
      total_cost: 306,
      potential_payout: 1000,
      status: "open",
      payout: 0,
      placed_at: "2026-11-01T00:00:00Z",
      settled_at: null,
    };
    const market = {
      id: marketId,
      tournament_id: "awc2026",
      bracket_match_id: "final",
      round_name: "Finals",
      round_order: 4,
      player_one: "crepuscular",
      player_two: "natso",
      player_one_price: 30,
      player_two_price: 70,
      market_kind: "match",
      category: "AWC Finals",
      category_order: 1,
      label: "Atomic World Championship 2026 Final: crepuscular vs natso",
      tournament_betting_outcomes: [],
      status: "open",
      winner: null,
      closes_at: "2099-12-31T00:00:00Z",
      updated_at: "2026-11-01T00:00:00Z",
      settled_at: null,
    };
    return route.fulfill({
      json: {
        result:
          action === "allBets" || action === "bets" ? [bet] : action === "markets" ? [market] : [],
      },
    });
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
