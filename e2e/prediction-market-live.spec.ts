import type { WebSocketRoute } from "@playwright/test";

import { expect, test } from "./fixtures";

test("Betting categories show active groups and omit retired markets", async ({ page }) => {
  const initialMarketId = "awc-2026-semifinal-jude-3-plus-points";
  const bettingRequests: { action: string; marketIds?: string[] }[] = [];
  const groups = [
    ["awc-2026-semifinals", "AWC 2026 Semifinals"],
    ["ban-2026", "Ban markets"],
    ["awc-2026-losers-round-2", "AWC 2026 Losers Round 2"],
    ["awc-2026-round-of-16", "AWC 2026 Round of 16"],
    ["november-atomic-shield-2026", "November Atomic Shield"],
    ["awc-2026-champion", "Who will win 2026 AWC"],
    ["awc-2027-champion", "Who will win 2027 AWC"],
  ];
  const catalog = groups.map(([id, title], index) => ({
    id: id === "awc-2026-semifinals" ? initialMarketId : `${id}-strike`,
    group_id: id,
    group_path: `/betting/${id}`,
    group_title: title,
    group_description: "",
    group_order: index,
    display_name: id === "awc-2026-semifinals" ? "jude 3+ pts vs max" : "Will there be Armageddon?",
    country_code: "",
    starting_chance: null,
    display_order: 1,
    outcome_yes_label: null,
    outcome_no_label: null,
    outcome_yes_country_code: null,
    outcome_no_country_code: null,
  }));
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => socket.close());
  await page.route("**/api/coins", (route) =>
    route.fulfill({ json: { result: { balance: 200, dailyClaimAvailable: false } } }),
  );
  await page.route("**/api/betting", (route) => {
    const body = route.request().postDataJSON();
    bettingRequests.push(body);
    if (["markets", "bets", "allBets", "predictionPositions"].includes(body.action))
      return route.fulfill({ json: { result: [] } });
    if (body.action === "exchangeMarkets") return route.fulfill({ json: { result: catalog } });
    if (body.action === "exchangeMarketBatch")
      return route.fulfill({
        json: {
          result: body.marketIds.map((id: string) => ({
            market: {
              id,
              question: "Will there be Armageddon?",
              resolution_rules: "Official AWC results.",
              resolution_source_url: "https://lichess.org/team/atomic-wc",
              closes_at: "2099-01-01T00:00:00Z",
              status: "open",
              outcome: null,
              resolved_at: null,
              settlement_price_cents: null,
              settlement_reference_fill_id: null,
            },
            book: {
              yes: { bids: [], asks: [{ priceCents: 65, quantity: 1538 }] },
              no: { bids: [], asks: [{ priceCents: 50, quantity: 2000 }] },
            },
            fills: [],
            positions: [],
            historyPositions: [],
            orders: [],
          })),
        },
      });
    return route.fulfill({ status: 400, json: { error: "Unexpected fixture request" } });
  });
  await page.goto("/betting");
  const categories = page.getByLabel("Market categories", { exact: true });
  await expect(categories.getByRole("button", { name: "AWC Champion", exact: true })).toBeVisible();
  const tops = await categories
    .locator("button, select")
    .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().top));
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
  const sportsbookInitial = page.getByRole("button", { name: "Sportsbook view", exact: true });
  await sportsbookInitial.click();
  await page.getByRole("button", { name: /jude less than 3 pts vs max/ }).click();
  await expect(page.locator(".betSlipContract strong")).toHaveText("jude less than 3 pts vs max");
  expect(bettingRequests).toContainEqual({
    action: "exchangeMarketBatch",
    marketIds: [initialMarketId],
  });
  await expect(page.getByRole("tab", { name: "All bets (0)", exact: true })).toBeVisible();
  expect(bettingRequests).toContainEqual({ action: "predictionPositions" });
  expect(
    bettingRequests.filter(
      ({ action, marketIds }) =>
        action === "bootstrap" || marketIds?.some((id) => id !== initialMarketId),
    ),
  ).toEqual([]);
  await expect(page.locator(".betSlipContract em")).toHaveCount(0);
  await page.getByRole("spinbutton", { name: "Bet amount" }).fill("10");
  await expect(page.getByRole("button", { name: "Place bet · 10.2 coins" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /jude 3\+ pts vs max/ })).toBeVisible();
  await page.getByRole("button", { name: "Order book view", exact: true }).click();
  await expect(page.getByText("jude 3+ pts vs max", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /jude less than 3 pts vs max/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "All bets (0)", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toBeVisible();
  expect(
    bettingRequests.filter(({ marketIds }) => marketIds?.some((id) => id !== initialMarketId)),
  ).toEqual([]);
  await page.getByRole("tab", { name: "Markets", exact: true }).click();

  const ban = categories.getByRole("button", { name: "Ban", exact: true });
  await expect(categories.getByRole("option", { name: "Ban", exact: true })).toHaveCount(0);
  await expect(categories.getByRole("button", { name: "AWC Side Bets", exact: true })).toHaveCount(
    0,
  );
  await ban.click();
  await expect(ban).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Ban markets", { exact: true })).toBeVisible();
  const losers2 = page.getByRole("button", { name: "AWC Losers 2", exact: true });
  await losers2.click();
  await expect(losers2).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("AWC 2026 Losers Round 2", { exact: true })).toBeVisible();
  await page.reload();
  await expect(losers2).toHaveAttribute("aria-pressed", "true");
  const other = page.getByRole("combobox", { name: "Other markets", exact: true });
  await expect(categories.getByRole("button", { name: "Nov Shield", exact: true })).toHaveCount(0);
  await expect(other.getByRole("option", { name: "Nov Shield", exact: true })).toHaveCount(0);
  const champion = categories.getByRole("button", { name: "AWC Champion", exact: true });
  await champion.click();
  await expect(champion).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(champion).toHaveAttribute("aria-pressed", "true");
  const sportsbook = page.getByRole("button", { name: "Sportsbook view", exact: true });
  const orderBook = page.getByRole("button", { name: "Order book view", exact: true });
  await sportsbook.click();
  await expect(sportsbook).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("group", { name: "Winner side" })).toBeVisible();
  await orderBook.click();
  await expect(orderBook).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(orderBook).toHaveAttribute("aria-pressed", "true");
  for (const category of ["AWC Round of 16", "AWC Losers 1", "AWC 2027"]) {
    await expect(page.getByRole("button", { name: category, exact: true })).toHaveCount(0);
    await other.selectOption(category);
    await expect(other).toHaveValue(category);
  }
  await page.reload();
  await expect(other).toHaveValue("AWC 2027");
  await page.goBack();
  await expect(other).toHaveValue("AWC Losers 1");
  await page.goForward();
  await expect(other).toHaveValue("AWC 2027");
  await page.setViewportSize({ width: 390, height: 844 });
  await other.selectOption("AWC Round of 16");
  await expect(other).toHaveValue("AWC Round of 16");
  await page.goto("/betting?market=shield");
  await expect(
    categories.getByRole("button", { name: "AWC Semifinals", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/betting/awc-2026-side-bets");
  await expect(page).toHaveURL(/\/betting\?/);
  await expect(page.getByRole("heading", { name: "Betting", exact: true })).toBeVisible();
});

test("completed strike opens on P&L and loads chart history only when selected", async ({
  page,
}) => {
  let completedStatus: "resolved" | "closed" | "open" = "resolved";
  const marketId = "awc-2026-champion-natso";
  const positionScopes: Array<string[] | undefined> = [];
  const periods: string[] = [];
  const end = Date.parse("2026-11-14T12:00:00Z");
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => socket.close());
  await page.route("**/api/coins", (route) =>
    route.fulfill({ json: { result: { balance: 200, dailyClaimAvailable: false } } }),
  );
  const position = {
    market_id: marketId,
    username: "e2e-player",
    outcome: "yes",
    quantity: 5,
    reserved_quantity: 0,
    average_price_cents: 20.75,
    closed_cost_coins: 3.1125,
    closed_proceeds_coins: 8,
    fees_coins: 0,
    updated_at: new Date(end).toISOString(),
  };
  await page.route("**/api/betting", (route) => {
    const body = route.request().postDataJSON();
    if (["markets", "bets", "allBets"].includes(body.action))
      return route.fulfill({ json: { result: [] } });
    if (body.action === "predictionPositions") {
      positionScopes.push(body.marketIds);
      return route.fulfill({
        json: {
          result: [position],
          markets: [
            {
              id: marketId,
              status: completedStatus,
              outcome: completedStatus === "resolved" ? "yes" : null,
              settlement_price_cents: null,
              sportsbook_volume_coins: 0,
              exchange_volume_coins: 0,
            },
          ],
        },
      });
    }
    if (body.action === "exchangeMarkets")
      return route.fulfill({
        json: {
          result: [
            {
              id: marketId,
              group_id: "awc-2026-champion",
              group_path: "/betting/awc-2026-champion",
              group_title: "Who will win 2026 AWC",
              group_description: "",
              group_order: 1,
              display_name: "natso",
              country_code: "NL",
              starting_chance: 30,
              display_order: 1,
              outcome_yes_label: null,
              outcome_no_label: null,
              outcome_yes_country_code: null,
              outcome_no_country_code: null,
            },
          ],
        },
      });
    if (body.action === "exchangeTraderHistory") {
      expect(body.marketId).toBe(marketId);
      expect(body.username).toBe("e2e-player");
      return route.fulfill({
        json: {
          result: [
            {
              id: "buy:1",
              createdAt: new Date(end - 2000).toISOString(),
              action: "buy",
              outcome: "yes",
              averagePriceCents: 20.75,
              quantity: 20,
              pnlChange: 0,
              runningPnl: 0,
            },
            {
              id: "sell:2",
              createdAt: new Date(end - 1000).toISOString(),
              action: "sell",
              outcome: "yes",
              averagePriceCents: 53.333333,
              quantity: 15,
              pnlChange: 4.8875,
              runningPnl: 4.8875,
            },
            {
              id: "receipt:4",
              createdAt: new Date(end).toISOString(),
              action: "settlement",
              outcome: "yes",
              averagePriceCents: 100,
              quantity: 5,
              pnlChange: 3.9625,
              runningPnl: 8.85,
            },
          ],
        },
      });
    }
    if (body.action === "exchangeMarketBatch")
      return route.fulfill({
        json: {
          result: [
            {
              market: {
                id: marketId,
                question: "Who will win?",
                resolution_rules: "Official results.",
                resolution_source_url: "https://lichess.org/team/atomic-wc",
                closes_at:
                  completedStatus === "open" ? "2099-12-31T00:00:00Z" : new Date(end).toISOString(),
                status: completedStatus,
                outcome: completedStatus === "resolved" ? "yes" : null,
                resolved_at: completedStatus === "resolved" ? new Date(end).toISOString() : null,
                settlement_price_cents: null,
                settlement_reference_fill_id: null,
              },
              book: { yes: { bids: [], asks: [] }, no: { bids: [], asks: [] } },
              fills: [],
              positions: [position],
              historyPositions: [position],
              orders: [],
            },
          ],
        },
      });
    if (body.action === "exchangePriceHistory") {
      expect(body.marketId).toBe(marketId);
      periods.push(body.period);
      return route.fulfill({
        json: {
          result: {
            start: end - 3_600_000,
            end,
            points: [
              { time: end - 1000, open: 40, high: 60, low: 40, close: 60, price: 60, quantity: 12 },
            ],
            settlement: { time: end, price: 100 },
          },
        },
      });
    }
    return route.fulfill({ status: 400, json: { error: "Unexpected fixture request" } });
  });
  await page.goto("/betting/awc-2026-champion");
  await page.getByRole("button", { name: "View bets on natso", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "natso", exact: true });
  await expect(dialog.getByRole("table")).toContainText("+8.85");
  expect(positionScopes).toEqual([[marketId]]);
  await expect(dialog.getByRole("row").filter({ hasText: "e2e-player" })).toHaveCount(1);
  expect(periods).toEqual([]);
  const bettorRow = dialog.getByRole("row").filter({ hasText: "e2e-player" });
  await bettorRow.getByRole("cell").last().click();
  const transactions = dialog.getByRole("table", { name: "Transactions for e2e-player" });
  await expect(
    transactions.getByRole("columnheader", { name: "Running P&L", exact: true }),
  ).toHaveCount(0);
  await expect(transactions.getByRole("row").last()).toContainText("+8.85");
  await expect(dialog.getByText("+8.85", { exact: true })).toHaveCount(2);
  await dialog.getByRole("button", { name: "← P&L", exact: true }).click();
  const transactionButton = dialog.getByRole("button", {
    name: "View transactions for e2e-player",
    exact: true,
  });
  await expect(transactionButton).toBeFocused();
  await transactionButton.press("Enter");
  await expect(transactions).toBeVisible();
  await dialog.getByRole("button", { name: "← P&L", exact: true }).click();

  await dialog.getByRole("tab", { name: "Price chart", exact: true }).click();
  const chart = dialog.getByRole("slider", { name: "Inspect price history" });
  await expect(chart).toHaveAttribute("aria-valuetext", /100 cents/);
  await chart.focus();
  await page.keyboard.press("Home");
  await expect(chart).toHaveAttribute("aria-valuetext", /60 cents, 12 contracts/);
  await dialog.getByRole("button", { name: "1 hr", exact: true }).click();
  await expect.poll(() => periods).toEqual(["all", "1h"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(chart).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "View bets on natso", exact: true }).click();
  await expect(dialog.getByRole("tab", { name: "P&L", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  completedStatus = "closed";
  await page.reload();
  await page.getByRole("button", { name: "View bets on natso", exact: true }).click();
  await expect(dialog.getByRole("table")).toContainText("+4.89");
  await expect(dialog.getByRole("tab", { name: "P&L", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  completedStatus = "open";
  position.quantity = 0;
  position.closed_cost_coins = 4.15;
  position.closed_proceeds_coins = 9;
  await page.reload();
  await expect(page.getByLabel("Your profit: +4.85 coins", { exact: true })).toBeVisible();
  await page.goto("/betting?view=markets&market=champion");
  for (const view of ["Sportsbook view", "Order book view"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.getByLabel("Your profit: +4.85 coins", { exact: true })).toBeVisible();
  }
  await page.goto("/betting?view=mine");
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("all");
  await page.getByRole("combobox", { name: "Display", exact: true }).selectOption("pnl");
  const myBets = page.getByRole("table");
  await expect(myBets.getByRole("row")).toHaveCount(2);
  await expect(myBets).not.toContainText("Both sides");
  await expect(myBets).toContainText("+4.85");
});

test("live book updates render promptly and missed events recover without idle book downloads", async ({
  page,
}) => {
  const marketId = "awc-2026-champion-natso";
  const inactiveId = "ban-2026-strike";
  let balance = 200;
  let inBets = 25;
  let positionQuantity = 0;
  let paidOut = false;
  let inactiveVersion = 1;
  let deadline: number | null = null;
  await page.route("**/api/coins", (route) =>
    route.fulfill({ json: { result: { balance, inBets, dailyClaimAvailable: false } } }),
  );
  test.slow();
  let version = 1;
  let recoveryVersion = version;
  let ask: number | null = 30;
  let primaryCancelled = false;
  let extraOrder = false;
  let failNextCancel = false;
  const cancelledOrderIds: number[] = [];
  const batches: string[][] = [];
  let versionReads = 0;
  let incrementalReads = 0;
  const initialUpdateAt = new Date(Date.now() - 10_000).toISOString();
  let socket: WebSocketRoute | undefined;
  let topic = "";
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (connection) => {
    socket = connection;
    connection.onMessage((message) => {
      const [joinRef, ref, channel, event, payload] = JSON.parse(String(message));
      if (event === "phx_join") {
        topic = channel;
        connection.send(
          JSON.stringify([
            joinRef,
            ref,
            channel,
            "phx_reply",
            {
              status: "ok",
              response: {
                postgres_changes: payload.config.postgres_changes.map((filter: object) => ({
                  ...filter,
                  id: 1,
                })),
              },
            },
          ]),
        );
      } else if (event === "heartbeat" || event === "phx_leave") {
        connection.send(
          JSON.stringify([joinRef, ref, channel, "phx_reply", { status: "ok", response: {} }]),
        );
      }
    });
  });
  await page.route("**/rest/v1/prediction_market_updates?**", (route) => {
    versionReads++;
    if (new URL(route.request().url()).searchParams.has("updated_at")) incrementalReads++;
    return route.fulfill({
      json: [
        {
          market_id: marketId,
          version: recoveryVersion,
          change_scope: "book",
          updated_at: initialUpdateAt,
        },
        {
          market_id: inactiveId,
          version: inactiveVersion,
          change_scope: "book",
          updated_at: initialUpdateAt,
        },
      ],
    });
  });
  const catalog = ["natso", "rabbier"].map((username, index) => ({
    id: `awc-2026-champion-${username}`,
    group_id: "awc-2026-champion",
    group_path: "/betting/awc-2026-champion",
    group_title: "Who will win 2026 AWC",
    group_description: "",
    group_order: 1,
    display_name: username,
    country_code: "NL",
    starting_chance: 30,
    display_order: index,
    outcome_yes_label: null,
    outcome_no_label: null,
    outcome_yes_country_code: null,
    outcome_no_country_code: null,
  }));
  const inactiveMarket = {
    ...catalog[0]!,
    id: inactiveId,
    group_id: "ban-2026",
    group_path: "/betting/ban-2026",
    group_title: "Ban markets",
    display_name: "inactive strike",
  };
  const position = (id: string) => ({
    market_id: id,
    username: "e2e-player",
    outcome: "yes",
    quantity: positionQuantity,
    reserved_quantity: 0,
    average_price_cents: 31,
    updated_at: "2026-11-08T00:00:00Z",
  });
  const marketState = (id: string) => ({
    nextOrderExpiry: id === marketId && deadline && Date.now() < deadline ? deadline : null,
    market: {
      id,
      question: "Who will win AWC?",
      resolution_rules: "Official tournament results.",
      resolution_source_url: "https://lichess.org/team/atomic-wc",
      closes_at: "2099-12-31T00:00:00Z",
      status: "open",
      outcome: null,
      settlement_price_cents: null,
      settlement_reference_fill_id: null,
      resolved_at: null,
    },
    book: {
      yes: {
        bids: id === marketId && extraOrder ? [{ priceCents: 25, quantity: 10 }] : [],
        asks:
          id === marketId && ask !== null && (!deadline || Date.now() < deadline)
            ? [{ priceCents: ask, quantity: primaryCancelled ? 20 : 100 }]
            : [],
      },
      no: { bids: [], asks: [] },
    },
    fills: [],
    positions: id === marketId && positionQuantity > 0 ? [position(id)] : [],
    orders: [
      ...(id === marketId && ask !== null && !primaryCancelled
        ? [
            {
              id: 1,
              username: "e2e-player",
              outcome: "no",
              side: "buy",
              price_cents: 100 - ask,
              quantity: 100,
              filled_quantity: 20,
              remaining_quantity: 80,
              status: "partial",
              created_at: "2026-11-08T00:00:00Z",
              updated_at: "2026-11-08T00:00:00Z",
              expires_at: "2099-01-01T00:00:00Z",
            },
          ]
        : []),
      ...(id === marketId && extraOrder
        ? [
            {
              id: 2,
              username: "e2e-player",
              outcome: "yes",
              side: "buy",
              price_cents: 25,
              quantity: 10,
              filled_quantity: 0,
              remaining_quantity: 10,
              status: "open",
              created_at: "2026-11-08T00:00:00Z",
              updated_at: "2026-11-08T00:00:00Z",
              expires_at: "2099-01-01T00:00:00Z",
            },
          ]
        : []),
    ],
  });
  await page.route("**/api/betting", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "exchangeMarkets")
      return route.fulfill({ json: { result: [...catalog, inactiveMarket] } });
    if (body.action === "predictionPositions") {
      const ids = body.marketIds ?? [marketId, inactiveId];
      return route.fulfill({
        json: {
          result:
            positionQuantity > 0
              ? ids.filter((id: string) => id === marketId || id === inactiveId).map(position)
              : [],
          markets: ids.map((id: string) => ({
            id,
            status: id === inactiveId && paidOut ? "resolved" : "open",
            outcome: id === inactiveId && paidOut ? "yes" : null,
            settlement_price_cents: null,
          })),
        },
      });
    }
    if (body.action === "cancelExchangeOrder") {
      expect(body.marketId).toBe(marketId);
      if (failNextCancel) {
        failNextCancel = false;
        return route.fulfill({ status: 409, json: { error: "Cancellation failed. Try again." } });
      }
      cancelledOrderIds.push(body.orderId);
      if (body.orderId === 1) primaryCancelled = true;
      else if (body.orderId === 2) extraOrder = false;
      else throw new Error("Unexpected order cancellation");
      return route.fulfill({
        json: {
          result: { orderId: body.orderId, balance: 200, marketId, state: marketState(marketId) },
        },
      });
    }
    if (body.action === "exchangeMarketBatch") {
      batches.push(body.marketIds);
      return route.fulfill({
        json: {
          result: body.marketIds.map(marketState),
        },
      });
    }
    return route.fulfill({ status: 400, json: { error: "Unexpected test request" } });
  });
  await page.goto("/betting?market=champion");
  await page.getByRole("button", { name: "Order book view", exact: true }).click();
  const pending = page.getByRole("button", {
    name: "View your pending orders for natso",
    exact: true,
  });
  const marketRow = page.getByRole("button", { name: "natso 30%", exact: true });
  await expect(pending).toBeVisible();
  await marketRow.click();
  await expect(
    page.getByRole("button", { name: /Ask 30 cents, 100 contracts/ }).first(),
  ).toBeVisible();
  await expect(pending).toHaveCount(1);
  await page.getByRole("button", { name: "Edit your order at 30 cents", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit order", exact: true });
  await editor.getByRole("spinbutton", { name: "Contracts", exact: true }).click();
  await expect(editor).toBeVisible();
  await editor.click({ position: { x: 8, y: 8 } });
  await expect(editor).toHaveCount(0);
  await expect.poll(() => Boolean(socket && topic)).toBe(true);
  // Let the subscription and recovery baseline settle before measuring.
  await expect.poll(() => incrementalReads, { timeout: 7_000 }).toBeGreaterThanOrEqual(1);
  const settledBatches = batches.length;
  const idleReads = versionReads;
  await expect.poll(() => versionReads, { timeout: 7_000 }).toBeGreaterThanOrEqual(idleReads + 1);
  expect(batches).toHaveLength(settledBatches);

  const emitUpdate = (id: string, nextVersion: number) =>
    socket!.send(
      JSON.stringify([
        null,
        null,
        topic,
        "postgres_changes",
        {
          ids: [1],
          data: {
            schema: "public",
            table: "prediction_market_updates",
            type: "UPDATE",
            commit_timestamp: new Date().toISOString(),
            errors: null,
            columns: [
              { name: "market_id", type: "text" },
              { name: "version", type: "int8" },
              { name: "change_scope", type: "text" },
            ],
            record: { market_id: id, version: nextVersion, change_scope: "book" },
            old_record: {},
          },
        },
      ]),
    );
  ask = 31;
  positionQuantity = 8;
  balance = 192;
  inBets = 33;
  const realtimeStart = performance.now();
  emitUpdate(marketId, ++version);
  await expect(
    page.getByRole("button", { name: /Ask 31 cents, 100 contracts/ }).first(),
  ).toBeVisible({ timeout: 1_000 });
  const realtimeMs = Math.round(performance.now() - realtimeStart);
  expect(realtimeMs).toBeLessThan(1_000);
  expect(batches.at(-1)).toEqual([marketId]);
  const account = page.getByLabel("Betting account", { exact: true });
  const allBets = page.getByRole("tab", { name: /All bets/ });
  await expect(allBets).toHaveText("All bets (1)");
  await expect(account).toHaveText("Net worth225In bets33Balance192");
  await page
    .getByRole("button", { name: /Ask 31 cents, 100 contracts/ })
    .first()
    .click();
  await page
    .getByRole("group", { name: "Order side", exact: true })
    .getByRole("button", { name: "Sell", exact: true })
    .click();
  await expect(page.getByRole("spinbutton", { name: "Contracts", exact: true })).toHaveValue("8");
  await page
    .getByRole("group", { name: "Order side", exact: true })
    .getByRole("button", { name: "Buy", exact: true })
    .click();

  const previousBookCount = batches.length;
  emitUpdate(inactiveId, ++inactiveVersion);
  await expect(allBets).toHaveText("All bets (2)");
  expect(batches).toHaveLength(previousBookCount);
  paidOut = true;
  balance = 200;
  inBets = 25;
  // The market can settle in the same transaction that cancels orders and only signal "book".
  // Skip the websocket event and prove the version check reconciles the inactive market.
  inactiveVersion++;
  await expect(allBets).toHaveText("All bets (1)", { timeout: 6_500 });
  await expect(account).toHaveText("Net worth225In bets25Balance200");
  expect(batches).toHaveLength(previousBookCount);

  ask = null;
  version++;
  recoveryVersion = version;
  const recoveryStart = performance.now();
  await expect(page.getByRole("button", { name: /Ask 31 cents, 100 contracts/ })).toHaveCount(0, {
    timeout: 6_500,
  });
  const recoveryMs = Math.round(performance.now() - recoveryStart);
  await expect(pending).toHaveCount(0);
  expect(recoveryMs).toBeLessThan(6_500);
  expect(batches.at(-1)).toEqual([marketId]);
  ask = 32;
  extraOrder = true;
  recoveryVersion = ++version;
  await expect(pending).toBeVisible();
  for (const mode of ["light", "dark"]) {
    await page.getByRole("button", { name: "Open settings", exact: true }).click();
    await page.getByLabel("Color mode", { exact: true }).selectOption(mode);
    await page.getByRole("button", { name: "Open settings", exact: true }).click();
    const contrast = await pending
      .locator("span")
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        const context = document.createElement("canvas").getContext("2d")!;
        const luminance = (color: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const channels = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
            const channel = value / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
          });
          return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
        };
        const a = luminance(style.color),
          b = luminance(style.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(account).toBeVisible();
  await expect(account).toHaveText("Net worth225In bets25Balance200");
  await pending.click();
  const popup = page.getByRole("dialog", { name: "Your orders · natso", exact: true });
  const cancelPrimary = popup.getByRole("button", {
    name: "Cancel order for 80 No contracts at 68 cents",
    exact: true,
  });
  const cancelSecond = popup.getByRole("button", {
    name: "Cancel order for 10 Yes contracts at 25 cents",
    exact: true,
  });
  await expect(cancelPrimary).toBeVisible();
  await expect(cancelSecond).toBeVisible();
  failNextCancel = true;
  await cancelPrimary.click();
  await expect(popup.getByRole("alert")).toContainText("Cancellation failed");
  await expect(cancelPrimary).toBeVisible();
  await cancelPrimary.click();
  await expect(cancelPrimary).toHaveCount(0);
  await expect(cancelSecond).toBeVisible();
  await cancelSecond.click();
  await expect(popup.getByText("No pending orders.", { exact: true })).toBeVisible();
  await expect(pending).toHaveCount(0);
  expect(cancelledOrderIds).toEqual([1, 2]);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);

  deadline = Date.now() + 2_000;
  emitUpdate(marketId, ++version);
  const expiringAsk = page.getByRole("button", { name: /Ask 32 cents, 20 contracts/ }).first();
  await expect(expiringAsk).toBeVisible();
  await expect(expiringAsk).toHaveCount(0, { timeout: 6_500 });

  await page.goto("/betting");
  await expect(page.getByLabel("Betting account", { exact: true })).toHaveText(
    "Net worth225In bets25Balance200",
  );
  console.log(
    JSON.stringify({ realtimeMs, missedEventRecoveryMs: recoveryMs, idleBookDownloads: 0 }),
  );
});

test("betting order-book ticket sells only unreserved owned shares", async ({ page }) => {
  const marketId = "awc-2026-champion-natso";
  let quantity = 8;
  const orders: unknown[] = [];
  const state = () => ({
    market: {
      id: marketId,
      question: "Who will win AWC?",
      resolution_rules: "Official results.",
      resolution_source_url: "https://lichess.org/team/atomic-wc",
      closes_at: "2099-12-31T00:00:00Z",
      status: "open",
      outcome: null,
      settlement_price_cents: null,
      settlement_reference_fill_id: null,
      resolved_at: null,
    },
    book: {
      yes: { bids: [], asks: [{ priceCents: 30, quantity: 100 }] },
      no: { bids: [{ priceCents: 40, quantity: 100 }], asks: [] },
    },
    positions: [
      {
        outcome: "no",
        quantity,
        reserved_quantity: 3,
        average_price_cents: 20,
        updated_at: "2026-11-01T00:00:00Z",
      },
    ],
    orders: [],
    fills: [],
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => socket.close());
  await page.route("**/api/coins", (route) =>
    route.fulfill({ json: { result: { balance: 0, dailyClaimAvailable: false } } }),
  );
  await page.route("**/api/betting", (route) => {
    const body = route.request().postDataJSON();
    if (["markets", "bets", "allBets", "predictionPositions"].includes(body.action))
      return route.fulfill({ json: { result: [] } });
    if (body.action === "exchangeMarkets")
      return route.fulfill({
        json: {
          result: [
            {
              id: marketId,
              group_id: "awc-2026-champion",
              group_path: "/betting/awc-2026-champion",
              group_title: "Who will win 2026 AWC",
              group_description: "",
              group_order: 1,
              display_name: "natso",
              country_code: "NL",
              starting_chance: 30,
              display_order: 1,
              outcome_yes_label: null,
              outcome_no_label: null,
              outcome_yes_country_code: null,
              outcome_no_country_code: null,
            },
          ],
        },
      });
    if (body.action === "exchangeMarketBatch")
      return route.fulfill({ json: { result: [state()] } });
    if (body.action === "placeExchangeOrder") {
      orders.push(body);
      quantity = 3;
      if (orders.length === 1)
        return route.fulfill({ status: 500, json: { error: "Order response was lost" } });
      return route.fulfill({
        json: { result: { orderId: 10, balance: 1.96, marketId, state: state() } },
      });
    }
    return route.fulfill({ status: 400, json: { error: "Unexpected fixture request" } });
  });
  await page.goto("/betting?view=markets&market=champion");
  await page.getByRole("button", { name: "Order book view", exact: true }).click();
  await page
    .getByLabel("natso outcome", { exact: true })
    .getByRole("button", { name: /Yes/ })
    .click();
  const sides = page.getByRole("group", { name: "Order side", exact: true });
  await sides.getByRole("button", { name: "Sell", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Prediction outcome" }).getByRole("button", { name: /No/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("group", { name: "Prediction outcome" }).getByRole("button", { name: /Yes/ }),
  ).toBeDisabled();
  const contracts = page.getByRole("spinbutton", { name: "Contracts", exact: true });
  await expect(contracts).toHaveValue("5");
  await page.getByRole("spinbutton", { name: /Limit price/ }).fill("40");
  const submit = page.getByRole("button", { name: "Sell No · 40¢", exact: true });
  await contracts.fill("6");
  await expect(submit).toBeDisabled();
  await contracts.fill("5");
  await expect(page.getByText("1.96 coins", { exact: true })).toBeVisible();
  await submit.click();
  await expect.poll(() => orders.length).toBe(1);
  await page.getByRole("button", { name: "Retry original order", exact: true }).click();
  await expect.poll(() => orders.length).toBe(2);
  expect(orders[1]).toEqual(orders[0]);
  expect(orders[0]).toMatchObject({
    action: "placeExchangeOrder",
    marketId,
    outcome: "no",
    side: "sell",
    priceCents: 40,
    quantity: 5,
  });
  await expect(sides.getByRole("button", { name: "Sell", exact: true })).toHaveCount(0);
  await expect(page.getByText("Prediction order placed.", { exact: true })).toBeVisible();
  await page.goto("/betting/awc-2026-champion");
  await page
    .getByLabel("natso outcome", { exact: true })
    .getByRole("button", { name: /Yes/ })
    .click();
  await expect(sides.getByRole("button", { name: "Sell", exact: true })).toHaveCount(0);
});
