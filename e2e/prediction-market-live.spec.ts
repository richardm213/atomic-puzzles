import type { WebSocketRoute } from "@playwright/test";

import { expect, test } from "./fixtures";

test("live book updates render promptly and missed events recover without idle book downloads", async ({
  page,
}) => {
  const marketId = "awc-2026-champion-natso";
  let version = 1;
  let recoveryVersion = version;
  let ask: number | null = 30;
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
  await page.route("**/api/betting", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "exchangeMarkets") return route.fulfill({ json: { result: catalog } });
    if (body.action === "allBets") return route.fulfill({ json: { result: [] } });
    if (body.action === "exchangeMarketBatch") {
      batches.push(body.marketIds);
      return route.fulfill({
        json: {
          result: body.marketIds.map((id: string) => ({
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
                bids: [],
                asks: id === marketId && ask !== null ? [{ priceCents: ask, quantity: 100 }] : [],
              },
              no: { bids: [], asks: [] },
            },
            fills: [],
            positions: [],
            orders: [],
          })),
        },
      });
    }
    return route.fulfill({ status: 400, json: { error: "Unexpected test request" } });
  });
  await page.goto("/betting/awc-2026-champion");
  await page.getByRole("button", { name: "natso 30%", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Ask 30 cents, 100 contracts/ }).first(),
  ).toBeVisible();
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
  expect(recoveryMs).toBeLessThan(3_000);
  expect(batches.at(-1)).toEqual([marketId]);
  console.log(
    JSON.stringify({ realtimeMs, missedEventRecoveryMs: recoveryMs, idleBookDownloads: 0 }),
  );
});
