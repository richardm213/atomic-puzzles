import { expect, test } from "./fixtures";

for (const banned of [false, true]) {
  for (const width of [1280, 390]) {
    test(`unrated history banned=${banned} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route("**/api/archive-data?**", (route) => {
        const resource = new URL(route.request().url()).searchParams.get("resource");
        const body =
          resource === "aliases"
            ? [{ username: "alice", alias: "alice", banned, count_games: "y" }]
            : resource === "matches"
              ? {
                  total: 1,
                  rows: [
                    {
                      match_id: "unrated-match",
                      player_1: "alice",
                      player_2: "bob",
                      start_ts: 1700000000000,
                      time_control: "3+0",
                      source: "arena",
                      tournament_id: null,
                      games: ["game1234,w,1,1"],
                      p1_before_rating: null,
                      p1_after_rating: null,
                      p1_before_rd: null,
                      p1_after_rd: null,
                      p2_before_rating: null,
                      p2_after_rating: null,
                      p2_before_rd: null,
                      p2_after_rd: null,
                    },
                  ],
                }
              : [];
        return route.fulfill({ json: body });
      });
      await page.goto("/@/alice/history");
      const table = page.locator(".profileMatchTable");
      await expect(table.getByText("bob", { exact: true })).toBeVisible();
      await expect(table.locator("th")).toHaveCount(banned ? 5 : 7);
      const row = table.locator("tbody > tr").first();
      if (!banned) {
        await expect(row.locator("td").nth(4)).toBeEmpty();
        await expect(row.locator("td").nth(5)).toBeEmpty();
      }
      await row.focus();
      await page.keyboard.press("Enter");
      await expect(table.getByText("Unrated", { exact: true })).toHaveCount(2);
      await expect(table.getByRole("link", { name: "game1234", exact: true })).toHaveAttribute(
        "href",
        /game1234/,
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.screenshot({ path: `/tmp/atomic-unrated-${banned}-${width}.png`, fullPage: true });
    });
  }
}

for (const width of [1280, 390]) {
  for (const view of ["recent", "detail", "h2h", "h2h-wolfrandom"]) {
    test(`unrated ${view} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const mode = view === "h2h-wolfrandom" ? "wolfrandom" : "blitz";
      await page.route("**/api/archive-data?**", (route) => {
        const params = new URL(route.request().url()).searchParams;
        const resource = params.get("resource");
        if (resource === "aliases") {
          return route.fulfill({
            json: ["alice", "bob"].map((username) => ({
              username,
              alias: username,
              banned: username === "bob",
              count_games: "y",
            })),
          });
        }
        if (resource !== "matches") return route.fulfill({ json: [] });
        // Default searches must not send rating bounds that hide unrated matches.
        expect(params.has("ratingMin")).toBe(false);
        expect(params.has("ratingMax")).toBe(false);
        return route.fulfill({
          json:
            params.get("mode") !== mode
              ? { rows: [], total: 0 }
              : {
                  total: 1,
                  rows: [
                    {
                      match_id: "unrated-match",
                      player_1: "alice",
                      player_2: "bob",
                      start_ts: 1700000000000,
                      time_control: "3+0",
                      source: "arena",
                      tournament_id: null,
                      games: ["game1234,w,1,1", "game5678,d,0,2"],
                      p1_before_rating: null,
                      p1_after_rating: null,
                      p1_before_rd: null,
                      p1_after_rd: null,
                      p2_before_rating: null,
                      p2_after_rating: null,
                      p2_before_rd: null,
                      p2_after_rd: null,
                    },
                  ],
                },
        });
      });
      await page.goto(
        view === "recent"
          ? "/recent"
          : view === "detail"
            ? "/matches/blitz/unrated-match"
            : "/h2h/alice-vs-bob",
      );
      if (view === "recent") {
        const card = page.locator(".matchCard").first();
        await expect(card).toBeVisible();
        await card.focus();
        await page.keyboard.press("Enter");
      } else if (view.startsWith("h2h")) {
        const row = page.locator(".h2hMatchTableRow").first();
        await expect(row).toBeVisible();
        await row.focus();
        await page.keyboard.press("Enter");
      }
      const stats = page.locator(".matchCardPlayerStats");
      await expect(stats.getByText("Unrated", { exact: true })).toHaveCount(2);
      await expect(stats.getByRole("img", { name: "Banned player" })).toHaveCount(1);
      await expect(
        stats
          .locator("strong")
          .filter({ hasText: "bob" })
          .getByRole("img", { name: "Banned player" }),
      ).toBeVisible();

      await expect(stats).not.toContainText(/NaN|null|Rating 0|RD 0/);
      await expect(page.getByRole("link", { name: "game1234", exact: true })).toHaveAttribute(
        "href",
        /game1234/,
      );
      await expect(page.getByRole("link", { name: "game5678", exact: true })).toHaveAttribute(
        "href",
        /game5678/,
      );
      if (view !== "detail") {
        await expect(page.locator('a[href="/matches/' + mode + '/unrated-match"]')).toBeVisible();
      } else {
        await expect(page.getByLabel("Score 1.5 to 0.5", { exact: true })).toBeVisible();
      }
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    });
  }
}
