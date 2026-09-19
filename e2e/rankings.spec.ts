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

test("Wolfrandom still starts in July 2026", async ({ page }) => {
  await page.goto("/rankings?year=2026&month=Jul&mode=wolfrandom");
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toHaveValue("wolfrandom");
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByRole("combobox", { name: "Month", exact: true })).toHaveValue("Jun");
  await expect(page.getByRole("option", { name: "Wolfrandom", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Mode", exact: true })).toHaveValue("blitz");
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByRole("option", { name: "Wolfrandom", exact: true })).toHaveCount(1);
});

test("yearly rankings use yearly eligibility and omit RD", async ({ page }) => {
  const request = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.searchParams.get("resource") === "yearly_leaderboard" &&
      url.searchParams.get("year") === "2016"
    );
  });
  await page.goto("/rankings/yearly?year=2016&mode=bullet");
  await request;

  await expect(page.getByRole("heading", { name: "Yearly Rankings" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Month" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: /RD/ })).toHaveCount(0);
  await expect(page.getByLabel("Bullet eligibility")).toHaveText(
    /Requirement: 250\+ games with RD less than 60 this year/,
  );
  await page.getByRole("combobox", { name: "Mode", exact: true }).selectOption("blitz");
  await expect(page.getByLabel("Blitz eligibility")).toHaveText(
    /Requirement: 150\+ games with RD less than 60 this year/,
  );
  await page.getByRole("combobox", { name: "Mode", exact: true }).selectOption("hyperbullet");
  await expect(page.getByLabel("Hyper eligibility")).toHaveText(
    /Requirement: 350\+ games with RD less than 60 this year/,
  );
  await expect(page.getByRole("option", { name: "Wolfrandom", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Previous year" })).toBeDisabled();
  await expect(page.getByRole("link", { name: "How are ratings calculated?" })).toHaveCount(0);

  await page.getByRole("link", { name: "How are yearly ratings determined?" }).click();
  await expect(page).toHaveURL(/\/rankings\/how-ratings-work#yearly-rankings$/);
  await expect(page.locator("#yearly-rankings")).toContainText(
    "average of every post-game rating recorded while their RD was below 60",
  );
});
