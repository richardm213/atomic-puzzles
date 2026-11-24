import type { BettorProfile } from "../shared/domain/bettorProfile";
import { expect, test } from "./fixtures";

test("the All bets bettor link opens a profile with trading history and positions", async ({
  page,
}) => {
  const marketId = "awc2026-semifinal";
  const settledId = "awc2026-quarterfinal";
  const path = "/betting/awc-2026-semifinals";
  const username = "alice";
  const date = "2026-11-01T00:00:00Z";
  const profile: BettorProfile = {
    username,
    netWorth: 304,
    balance: 300,
    openCost: 4,
    realizedPnl: 17,
    puzzleSolveCoins: 31,
    puzzleCreationCoins: 89,
    coinsSpent: -46,
    markets: {
      [marketId]: { title: "AWC semifinal", path, yes: "Alice", no: "Bob" },
      [settledId]: {
        title: "AWC quarterfinal",
        path: "/betting/awc-2026-quarterfinals",
        yes: "Alice",
        no: "Bob",
      },
    },
    openPositions: [{ marketId, outcome: "yes", quantity: 10, cost: 4 }],
    pnlByDay: [{ day: "2026-11-01", pnl: 17 }],
    settledBets: [
      { marketId: settledId, outcome: "yes", settledAt: date, status: "resolved", pnl: 17 },
    ],
  };
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => socket.close());
  await page.route("**/api/betting", (route) => {
    const request = route.request().postDataJSON();
    if (request.action === "bettorProfile") {
      expect(request.username).toBe(username);
      return route.fulfill({ json: { result: profile } });
    }
    if (request.action === "exchangeMarkets")
      return route.fulfill({
        json: {
          result: [
            {
              id: marketId,
              group_id: "awc-2026-semifinals",
              group_path: path,
              group_title: "AWC Semifinals",
              group_description: "",
              group_order: 1,
              display_name: "Alice vs Bob",
              country_code: "",
              starting_chance: 40,
              display_order: 1,
              outcome_yes_label: "Alice",
              outcome_no_label: "Bob",
              outcome_yes_country_code: null,
              outcome_no_country_code: null,
            },
          ],
        },
      });
    if (request.action === "predictionPositions")
      return route.fulfill({
        json: {
          result: [
            {
              market_id: marketId,
              username,
              outcome: "yes",
              quantity: 10,
              reserved_quantity: 0,
              average_price_cents: 40,
              updated_at: date,
            },
          ],
        },
      });
    return route.fulfill({ json: { result: [] } });
  });
  await page.goto("/betting?view=all");
  await page.getByRole("link", { name: username, exact: true }).click();
  await expect(page).toHaveURL(/\/@\/alice\/betting$/);
  const pnl = page.getByRole("region", { name: "Realized P&L" });
  await expect(pnl.getByText("+17 coins").first()).toBeVisible();
  const worth = page.getByRole("region", { name: "Net worth" });
  await expect(worth.getByText("304 coins")).toBeVisible();
  await expect(worth.getByText("31", { exact: true })).toBeVisible();
  await expect(worth.getByText("89", { exact: true })).toBeVisible();
  await expect(worth.getByText("-46", { exact: true })).toBeVisible();
  const chart = pnl.getByRole("slider", { name: "Inspect cumulative P&L by date" });
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(chart).toHaveAttribute("aria-valuetext", /0 coins$/);
  const positions = page.getByRole("table", { name: "Open positions" });
  await expect(positions.getByRole("link", { name: "AWC semifinal" })).toHaveAttribute(
    "href",
    `${path}?market=${marketId}`,
  );
  await expect(positions.getByRole("cell", { name: "10", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /^Bet history/ }).click();
  const settled = page.getByRole("table", { name: "Settled bets" });
  await expect(settled.getByRole("link", { name: "AWC quarterfinal" })).toBeVisible();
  await expect(settled.getByRole("link", { name: "AWC semifinal" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
