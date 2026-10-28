import type { Page, Route } from "@playwright/test";
import { expect, test as base } from "@playwright/test";

const puzzleRows = [
  {
    id: 101,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    solution: "e4 e5",
    author: "e2e-player",
    event: "Browser test set",
    explanation: "Control the center before the atomic attack begins.",
    tags: ["development"],
  },
  {
    id: 102,
    fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
    solution: "e5 Nf3",
    author: "e2e-player",
    event: "Browser test set",
    explanation: "A second deterministic position for navigation coverage.",
    tags: ["development"],
  },
];

const jsonResponse = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    headers: {
      "access-control-allow-origin": "*",
      "content-range": Array.isArray(body)
        ? `0-${Math.max(0, body.length - 1)}/${body.length}`
        : "*",
    },
    body: JSON.stringify(body),
  });

const installApiMocks = async (page: Page) => {
  await page.route("**/api/auth/session", (route) =>
    jsonResponse(route, { user: { username: "e2e-player" } }),
  );
  await page.route("**/api/notifications**", (route) => jsonResponse(route, []));
  await page.route("**/api/puzzles/play", async (route) => {
    const body = route.request().postDataJSON() as { puzzleIds?: Array<number | string> };
    const requestedIds = new Set((body.puzzleIds ?? []).map(String));
    return jsonResponse(route, {
      puzzles: puzzleRows.filter((row) => requestedIds.has(String(row.id))),
    });
  });
  await page.route("**/api/archive-data?**", (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("resource") === "usernames") {
      const username = url.searchParams.get("exact") ?? "";
      return jsonResponse(route, username ? [{ username }] : []);
    }
    return jsonResponse(route, []);
  });
  await page.route("**/__e2e_supabase/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/rest/v1/tournament_catalog")) {
      return jsonResponse(route, [
        {
          id: "awc2026",
          series_key: "awc",
          series_name: "Atomic World Championship",
          title: "AWC 2026",
          year: 2026,
          start_date: "2026-09-07",
          end_date: "2026-12-20",
          status: "available",
          match_mode: "blitz",
          show_champion: true,
          display_order: 0,
        },
      ]);
    }
    if (url.pathname.includes("/rest/v1/puzzles")) {
      const idFilter = url.searchParams.get("id") ?? "";
      const requestedRows = idFilter
        ? puzzleRows.filter((row) => idFilter.includes(String(row.id)))
        : puzzleRows;
      return jsonResponse(route, requestedRows);
    }
    return jsonResponse(route, []);
  });
};

type AppFixtures = {
  apiMocks: void;
};

export const test = base.extend<AppFixtures>({
  apiMocks: [
    async ({ page }, use) => {
      await installApiMocks(page);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
