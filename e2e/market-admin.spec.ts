import { expect, test } from "./fixtures";

test("admin can preview a scored result and publish the whole checklist once", async ({ page }) => {
  await page.route("**/api/auth/session", (route) =>
    route.fulfill({ json: { user: { username: "seaside_tiramisu" } } }),
  );
  let resolutions = 0;
  const summary = {
    marketTitles: ["Alpha vs Beta"],
    winner: "alpha",
    score: "6–2",
    playedOn: "2026-11-15",
    matchId: "firstgame",
    bracketChanges: [{ id: "final", playerOne: "alpha", playerTwo: "gamma" }],
    pointChanges: [{ username: "alpha", before: 720, after: 960 }],
    payouts: [{ username: "bettor", amount: 200 }],
    notificationCount: 2,
    warnings: [],
  };
  const fixture = {
    tournament: "awc2026",
    id: "semi",
    p1: "alpha",
    p2: "beta",
    s1: 0,
    s2: 0,
    bracket: "main",
    round: "Semifinals",
    order: 1,
    match_id: null,
    played_on: null,
    winner_to: "final",
    loser_to: "lower",
  };
  await page.route("**/api/markets/admin", async (route) => {
    const body = route.request().postDataJSON();
    const result =
      body.action === "list"
        ? {
            markets: [
              {
                id: "awc2026-semi",
                title: "Alpha vs Beta",
                group: "AWC semifinals",
                status: resolutions ? "resolved" : "open",
                choices: { yes: "alpha", no: "beta" },
                fixture,
              },
            ],
          }
        : body.action === "preview"
          ? {
              version: "a".repeat(64),
              operationKey: "receipt",
              summary,
              archiveCandidates: [{ matchId: "firstgame", date: "2026-11-15", score: "6–2" }],
            }
          : (resolutions++,
            { operationKey: "receipt", summary, completedAt: "2026-11-15T20:00:00Z" });
    if (body.action === "resolve") {
      expect(body.input).toMatchObject({
        kind: "match",
        marketId: "awc2026-semi",
        score1: 6,
        score2: 2,
      });
      expect(body.version).toBe("a".repeat(64));
      await new Promise((r) => setTimeout(r, 150));
    }
    await route.fulfill({ json: { result } });
  });
  await page.goto("/admin/markets");
  await page.getByRole("button", { name: "Resolve Alpha vs Beta" }).click();
  const form = page.getByRole("form", { name: "Resolve Alpha vs Beta" });
  await expect(form.getByRole("button", { name: "Resolve and publish" })).toBeDisabled();
  await form.getByLabel("alpha score").fill("6");
  await form.getByLabel("beta score").fill("2");
  await expect(form.getByText("720 → 960", { exact: false })).toBeVisible();
  await expect(form.getByRole("button", { name: "Resolve and publish" })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(form.getByLabel("alpha score")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await form.getByRole("button", { name: "Resolve and publish" }).click();
  await expect(
    page.getByText("Result published. Payouts, notifications and tournament updates verified."),
  ).toBeVisible();
  expect(resolutions).toBe(1);
  await expect(page.getByRole("button", { name: "Resolve Alpha vs Beta" })).toHaveCount(0);
});
