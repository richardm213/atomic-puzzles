import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-14T12:00:00Z"));
  await page.route("**/api/archive-data?**", (route) => route.fulfill({ json: [] }));
});

test("rankings support January 2016 as the earliest month", async ({ page }) => {
  const request = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.searchParams.get("resource") === "leaderboard" &&
      url.searchParams.get("month") === "2016-01-01"
    );
  });
  await page.goto("/rankings?year=2016&month=Jan&mode=blitz");
  await request;

  await expect(page.getByRole("combobox", { name: "Year", exact: true })).toHaveValue("2016");
  await expect(
    page.getByRole("combobox", { name: "Year", exact: true }).locator("option").last(),
  ).toHaveValue("2016");
  await expect(
    page.getByRole("combobox", { name: "Month", exact: true }).locator("option"),
  ).toHaveCount(12);
  await expect(page.getByText("January 2016", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous month" })).toBeDisabled();
  await expect(page.getByRole("option", { name: "Wolfrandom", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByRole("combobox", { name: "Month", exact: true })).toHaveValue("Feb");
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByRole("combobox", { name: "Month", exact: true })).toHaveValue("Jan");
  await expect(page.getByRole("button", { name: "Previous month" })).toBeDisabled();
});

test("Wolfrandom is available from July through September 2026", async ({ page }) => {
  await page.goto("/rankings?year=2026&month=Jul&mode=wolfrandom");
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toHaveValue("wolfrandom");
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByRole("combobox", { name: "Month", exact: true })).toHaveValue("Jun");
  await expect(page.getByRole("option", { name: "Wolfrandom", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toHaveValue("blitz");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByRole("option", { name: "Wolfrandom", exact: true })).toHaveCount(1);
  await page.getByRole("combobox", { name: "Mode", exact: true }).selectOption("wolfrandom");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByRole("combobox", { name: "Month", exact: true })).toHaveValue("Aug");
  await expect(page.getByRole("option", { name: "Wolfrandom", exact: true })).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toHaveValue("wolfrandom");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByRole("combobox", { name: "Month", exact: true })).toHaveValue("Sep");
  await expect(page.getByRole("option", { name: "Wolfrandom", exact: true })).toHaveCount(1);
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toHaveValue("wolfrandom");
});

test("yearly rankings show a yearly result without a current RD column", async ({ page }) => {
  await page.route("**/api/archive-data?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("resource") !== "yearly_leaderboard" || params.get("year") !== "2016") {
      return route.fallback();
    }
    return route.fulfill({
      json: [
        { username: "yearly-player", year: 2016, tc: "bullet", rank: 1, rating: 1700, games: 250 },
      ],
    });
  });
  await page.goto("/rankings/yearly?year=2016&mode=bullet");

  const table = page.getByRole("table");
  await expect(table.getByRole("row", { name: /yearly-player/ })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "RD", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Month" })).toHaveCount(0);
  await expect(page.getByLabel("Bullet eligibility")).toContainText(/250\+ games.*\b60\b/);
});
