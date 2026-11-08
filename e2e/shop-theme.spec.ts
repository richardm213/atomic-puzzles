import { expect, test } from "./fixtures";

test("Red Charcoal unlocks once and ownership is checked only when explicitly selected", async ({
  page,
}) => {
  let purchased = false;
  let accessChecks = 0;
  let purchases = 0;
  let purchaseAttempts = 0;
  let confirmPayment!: () => void;
  const paymentConfirmed = new Promise<void>((resolve) => {
    confirmPayment = resolve;
  });
  await page.route("**/api/coins", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "redCharcoalAccess") {
      accessChecks++;
      return route.fulfill({ json: { owned: purchased } });
    }
    if (body.action === "summary")
      return route.fulfill({
        json: { result: { balance: purchased ? 100 : 200, dailyClaimAvailable: false } },
      });
    if (body.action === "history")
      return route.fulfill({
        json: {
          result: purchased
            ? [
                {
                  id: 8,
                  item_key: "theme_red_charcoal",
                  cost: 100,
                  status: "fulfilled",
                  created_at: "2026-11-08T00:00:00Z",
                  fulfilled_at: "2026-11-08T00:00:00Z",
                },
              ]
            : [],
        },
      });
    if (body.action === "redeem") {
      expect(body.itemKey).toBe("theme_red_charcoal");
      purchaseAttempts++;
      await paymentConfirmed;
      if (purchaseAttempts === 1) {
        return route.fulfill({
          status: 409,
          json: { error: "Purchase rejected. No coins charged." },
        });
      }
      purchased = true;
      purchases++;
      return route.fulfill({
        json: { result: { balance: 100, redemptionId: 8, status: "fulfilled" } },
      });
    }
    return route.fulfill({ status: 400, json: { error: "Unexpected test request" } });
  });
  await page.goto("/shop");
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("ruby");
  await expect(page.getByRole("link", { name: "Unlock Red Charcoal · 100 coins" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "default");
  expect(accessChecks).toBe(1);
  await page.getByRole("link", { name: "Unlock Red Charcoal · 100 coins" }).click();

  const item = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Red Charcoal theme", exact: true }) });
  await expect(item).toContainText("100");
  await item.getByRole("button", { name: "Buy", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Confirm|Buy/ })
    .click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Buying…" })).toBeDisabled();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "default");
  await expect(item.getByRole("button", { name: "Use theme" })).toHaveCount(0);
  confirmPayment();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Purchase rejected");
  await expect(
    page
      .getByRole("region", { name: "Coin balance and daily bonus" })
      .getByText("200", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "default");
  await expect(item.getByRole("button", { name: "Use theme" })).toHaveCount(0);
  await page.getByRole("dialog").getByRole("button", { name: "Buy for 100", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ruby");
  await expect(item.getByRole("button", { name: "Use theme" })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Coin balance and daily bonus" })
      .getByText("100", { exact: true }),
  ).toBeVisible();
  await item.getByRole("button", { name: "Use theme" }).click();
  expect(purchases).toBe(1);
  expect(accessChecks).toBe(1);

  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await page.getByLabel("Theme", { exact: true }).selectOption("default");
  await page.getByLabel("Theme", { exact: true }).selectOption("ruby");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ruby");
  expect(accessChecks).toBe(2);
  await page.reload();
  await expect(item.getByRole("button", { name: "Use theme" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-palette", "ruby");
  await page.getByRole("button", { name: "Open settings", exact: true }).click();
  await expect(page.getByLabel("Theme", { exact: true })).toHaveValue("ruby");
  expect(accessChecks).toBe(2);
  expect(purchases).toBe(1);
});

test("shop categories filter rewards and show prices in ascending order", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/coins", (route) => {
    const { action } = route.request().postDataJSON();
    return route.fulfill({
      json: { result: action === "summary" ? { balance: 200, dailyClaimAvailable: false } : [] },
    });
  });
  await page.goto("/shop");
  const categories = page.getByRole("group", { name: "Shop category" });
  const theme = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Red Charcoal theme", exact: true }) });
  const discord = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "1 month Discord Nitro Basic", exact: true }),
  });
  const lichess = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "1 month Lichess Patron", exact: true }) });
  await expect(categories.getByRole("button", { name: "All", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(theme).toBeVisible();
  await expect(discord).toBeVisible();
  await expect(lichess).toBeVisible();
  const prices = (await page.getByRole("article").locator(".shopItemPrice").allTextContents()).map(
    (price) => Number(price.replaceAll(",", "").trim()),
  );
  expect(prices).toEqual([...prices].sort((a, b) => a - b));
  await expect(
    page.getByRole("article").filter({ hasText: /12-hour AtomicDB|prize tournament format/ }),
  ).toHaveCount(0);

  await categories.getByRole("button", { name: "Discord", exact: true }).click();
  await expect(discord).toBeVisible();
  await expect(theme).toHaveCount(0);
  await expect(lichess).toHaveCount(0);
  await categories.getByRole("button", { name: "Lichess", exact: true }).click();
  await expect(lichess).toBeVisible();
  await expect(discord).toHaveCount(0);
  await categories.getByRole("button", { name: "Site", exact: true }).click();
  await expect(theme).toBeVisible();
  await expect(lichess).toHaveCount(0);
  await categories.getByRole("button", { name: "All", exact: true }).click();
  await expect(theme).toBeVisible();
  await expect(discord).toBeVisible();
  await expect(lichess).toBeVisible();
});
