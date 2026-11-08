import type { WebSocketRoute } from "@playwright/test";

import { expect, test } from "./fixtures";

test("live book updates render promptly and missed events recover without idle book downloads", async ({
  page,
}) => {
  const marketId = "awc-2026-champion-natso";
  await page.route("**/api/coins", (route) =>
    route.fulfill({ json: { result: { balance: 200, inBets: 25, dailyClaimAvailable: false } } }),
  );
  let version = 1;
  let recoveryVersion = version;
  let ask: number | null = 30;
  let primaryCancelled = false;
  let extraOrder = false;
  let failNextCancel = false;
  const cancelledOrderIds: number[] = [];
  const batches: string[][] = [];
  let versionReads = 0;
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
    return route.fulfill({
      json: [{ market_id: marketId, version: recoveryVersion, change_scope: "book" }],
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
  const marketState = (id: string) => ({
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
          id === marketId && ask !== null
            ? [{ priceCents: ask, quantity: primaryCancelled ? 20 : 100 }]
            : [],
      },
      no: { bids: [], asks: [] },
    },
    fills: [],
    positions: [],
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
    if (body.action === "exchangeMarkets") return route.fulfill({ json: { result: catalog } });
    if (body.action === "allBets") return route.fulfill({ json: { result: [] } });
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
  await page.goto("/betting/awc-2026-champion");
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
  await expect.poll(() => Boolean(socket && topic)).toBe(true);
  // Let the subscription and recovery baseline settle before measuring.
  await expect.poll(() => versionReads).toBeGreaterThanOrEqual(2);
  const settledBatches = batches.length;
  const idleReads = versionReads;
  await expect.poll(() => versionReads).toBeGreaterThanOrEqual(idleReads + 2);
  expect(batches).toHaveLength(settledBatches);

  ask = 31;
  version++;
  const realtimeStart = performance.now();
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
          record: { market_id: marketId, version, change_scope: "book" },
          old_record: {},
        },
      },
    ]),
  );
  await expect(
    page.getByRole("button", { name: /Ask 31 cents, 100 contracts/ }).first(),
  ).toBeVisible({ timeout: 1_000 });
  const realtimeMs = Math.round(performance.now() - realtimeStart);
  expect(realtimeMs).toBeLessThan(1_000);
  expect(batches.at(-1)).toEqual([marketId]);

  ask = null;
  version++;
  recoveryVersion = version;
  const recoveryStart = performance.now();
  await expect(page.getByRole("button", { name: /Ask 31 cents, 100 contracts/ })).toHaveCount(0, {
    timeout: 3_000,
  });
  const recoveryMs = Math.round(performance.now() - recoveryStart);
  await expect(pending).toHaveCount(0);
  expect(recoveryMs).toBeLessThan(3_000);
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
  await expect(
    page.getByRole("link", { name: /Net worth 225 coins\. In bets 25 coins\. Balance 200 coins/ }),
  ).toBeVisible();
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
  console.log(
    JSON.stringify({ realtimeMs, missedEventRecoveryMs: recoveryMs, idleBookDownloads: 0 }),
  );
});
