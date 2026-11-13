import { readFileSync } from "node:fs";

import { expect, test } from "./fixtures";

test("practice hands off below the game threshold and honors engine speed", async ({ page }) => {
  await page.route("**/api/opening-explorer?**", (route) =>
    route.fulfill({
      json: {
        moves: [
          { uci: "d2d4", games: 4, whiteWins: 2, draws: 0, blackWins: 2, avgOpponentRating: null },
        ],
        recentGames: [],
      },
    }),
  );
  await page.route("**/api/atomicdb-analysis?**", (route) =>
    route.fulfill({ status: 404, json: { code: "position_not_found" } }),
  );
  // Exercise the real browser worker connection and board playback without fetching the hosted NNUE.
  await page.route("**/engines/atomic-stockfish/*/atomic-stockfish.worker.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      headers: { "cross-origin-embedder-policy": "require-corp" },
      body: `
        const line = (line) => self.postMessage({ type: "line", line });
        let fen = "";
        self.onmessage = ({ data }) => {
          if (data.type === "initialize") self.postMessage({ type: "ready" });
          if (data.type !== "command") return;
          const command = data.command;
          if (command === "isready") line("readyok");
          if (command.startsWith("position fen ")) fen = command.slice(13);
          if (command.startsWith("go ")) {
            if (!fen.startsWith("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w ")) {
              line("bestmove (none)");
              return;
            }
            line("info depth 15 multipv 1 score cp 20 pv e2e4");
            line("bestmove e2e4");
          }
        };
      `,
    }),
  );
  const searchCommands: string[] = [];
  await page.exposeFunction("recordEngineSearch", (command: string) =>
    searchCommands.push(command),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "atomic-puzzles.practice.settings",
      JSON.stringify({
        side: "black",
        clockEnabled: false,
        engine: { minGames: 5, strength: 12, speed: 1 },
      }),
    );
  });

  const response = await page.goto("/practice");
  expect(response?.headers()["cross-origin-opener-policy"]).toBe("same-origin");
  expect(response?.headers()["cross-origin-embedder-policy"]).toBe("require-corp");
  // Netlify must ship the same browser-compatible isolation policy as the local preview.
  const productionHeaders = readFileSync("public/_headers", "utf8");
  expect(productionHeaders).toContain("Cross-Origin-Opener-Policy: same-origin");
  expect(productionHeaders).toContain("Cross-Origin-Embedder-Policy: require-corp");
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(true);
  expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe("function");

  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- called below with the original Worker receiver
    const original = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function (message: unknown, ...args: unknown[]) {
      const data = message as { command?: string };
      if (data?.command?.startsWith("go "))
        void (
          window as unknown as { recordEngineSearch: (command: string) => void }
        ).recordEngineSearch(data.command);
      Reflect.apply(original, this, [message, ...args]);
    };
  });
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  // The exported FEN proves the worker's move actually reached the board.
  await expect(page.getByRole("textbox", { name: "FEN", exact: true })).toHaveValue(
    /^rnbqkbnr\/pppppppp\/8\/8\/4P3\/8\/PPPP1PPP\/RNBQKBNR b /,
  );
  expect(searchCommands).toContain("go movetime 150 depth 4");
});

test("practice keeps its PGN and position when creating puzzles or changing opponents", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const submissions: unknown[] = [];
  await page.route("**/api/opening-explorer?**", (route) =>
    route.fulfill({
      json: new URL(route.request().url()).searchParams.has("randomPlayer")
        ? { username: "random-player" }
        : { moves: [], recentGames: [] },
    }),
  );
  await page.route("**/api/puzzles/submit", (route) => {
    const input = route.request().postDataJSON();
    if (input.action === "starting-fen-match") return route.fulfill({ json: { puzzleId: null } });
    submissions.push(input);
    return route.fulfill({ json: { destination: "review", puzzle: { id: 42 } } });
  });

  await page.goto("/practice");
  const pgn = page.getByRole("textbox", { name: "PGN", exact: true });
  const fen = page.getByRole("textbox", { name: "FEN", exact: true });
  const importPgn = async (text: string) => {
    await pgn.fill(text);
    await pgn.press("Enter");
  };
  await importPgn("1. e4 (1. d4 d5) e5 2. Nf3");
  const moves = page.getByRole("region", { name: "Position analysis and played moves" });
  await moves.getByRole("button", { name: "2. Nf3", exact: true }).click({ button: "right" });
  await page.getByRole("menuitemcheckbox", { name: "Annotate with ?", exact: true }).click();
  await expect(pgn).toHaveValue(/Nf3\?/);
  await moves.getByRole("button", { name: /Nf3\?$/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(pgn).not.toHaveValue(/Nf3/);
  await expect(moves.getByRole("button", { name: /d5$/ })).toBeVisible();
  await moves.getByRole("button", { name: "1. e4", exact: true }).click();
  await expect(fen).toHaveValue(/4P3.* b /);
  const savedPgn = await pgn.inputValue();
  const savedFen = await fen.inputValue();

  const launcher = page
    .getByLabel("Position analysis controls", { exact: true })
    .getByRole("button", { name: "Submit puzzle", exact: true });
  const composer = moves.getByRole("form", { name: "Puzzle draft" });
  await launcher.click();
  await expect(page).toHaveURL(/\?puzzle=1#ply-0$/);
  await importPgn("1... c5 2. Nf3 (2. Nc3)");
  await composer.getByRole("button", { name: "2. Nc3", exact: true }).click({ button: "right" });
  await page.getByRole("menuitemcheckbox", { name: "Annotate with ?", exact: true }).click();
  await expect(pgn).toHaveValue(/Nc3\?/);
  await composer.getByRole("button", { name: /Nc3\?$/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(pgn).not.toHaveValue(/Nc3/);
  await expect(pgn).toHaveValue(/c5 2\. Nf3/);
  await composer.getByRole("button", { name: "1... c5", exact: true }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(pgn).toHaveValue("");
  await expect(fen).toHaveValue(savedFen);
  await composer.getByRole("button", { name: "Cancel" }).click();
  await expect(launcher).toBeFocused();
  await expect(pgn).toHaveValue(savedPgn);
  await expect(fen).toHaveValue(savedFen);
  expect(submissions).toHaveLength(0);

  await launcher.click();
  await composer.getByRole("checkbox", { name: "OPA style" }).check();
  await composer
    .getByRole("textbox", { name: "Explanation", exact: true })
    .fill("Challenge the center.");
  await composer.getByRole("button", { name: "Add tag", exact: true }).click();
  await composer.getByRole("searchbox", { name: "Search tags to add" }).fill("fork");
  await composer.getByRole("button", { name: "Add Fork", exact: true }).click();
  await importPgn("1... c5");
  await expect(page).toHaveURL(/\?puzzle=1#ply-1$/);
  await composer.getByRole("button", { name: "Submit puzzle" }).click();
  await expect(page.getByText("Puzzle submitted for review.")).toBeVisible();
  expect(submissions).toEqual([
    expect.objectContaining({
      fen: savedFen,
      solution: "1... c5",
      explanation: "Challenge the center.",
      opaStyle: true,
      tags: ["fork"],
    }),
  ]);
  await expect(pgn).toHaveValue(savedPgn);
  await expect(fen).toHaveValue(savedFen);

  await page.getByRole("button", { name: "Practice a random opponent" }).click();
  await expect(page).toHaveURL(/\/practice\/random-player$/);
  await page.reload();
  await expect(pgn).toHaveValue(savedPgn);
  await expect(fen).toHaveValue(savedFen);
  await page.getByRole("button", { name: "Start over", exact: true }).click();
  await expect(pgn).not.toHaveValue(/\be4\b|\bd4\b/);
  await page.reload();
  await expect(pgn).not.toHaveValue(/\be4\b|\bd4\b/);
});

test("analysis and practice share default sizing and material rows, with both practice clocks", async ({
  page,
}) => {
  let analysisSize: { board: number; controls: number } | undefined;
  const fen = "4k2r/8/8/8/8/8/PP6/1Q2K3 w - - 0 1";
  for (const route of ["/analysis", "/practice"]) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(route);
    const input = page.getByRole("textbox", { name: "FEN", exact: true });
    await input.fill(fen);
    await input.press("Enter");
    await expect(
      page.getByRole("img", { name: "White material difference: queen, pawn, pawn", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Black material difference: rook", exact: true }),
    ).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      board: document.querySelector("cg-board")!.getBoundingClientRect().width,
      controls: document
        .querySelector(".analysisRightPanel, .practicePanel")!
        .getBoundingClientRect().width,
    }));
    if (route === "/analysis") analysisSize = dimensions;
    else {
      expect(dimensions.board).toBeCloseTo(analysisSize!.board, 0);
      expect(dimensions.controls).toBeCloseTo(analysisSize!.controls, 0);
    }
    if (route === "/practice") {
      await expect(page.getByLabel("Your clock: 3:00", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Opponent clock: 3:00", { exact: true })).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const rows = page.locator(".boardClockRow");
    await expect(async () => {
      const top = await rows.first().boundingBox();
      const board = await page.locator(".analysisBoardPanel").boundingBox();
      const bottom = await rows.last().boundingBox();
      expect(board!.y - (top!.y + top!.height)).toBeGreaterThanOrEqual(0);
      expect(board!.y - (top!.y + top!.height)).toBeLessThanOrEqual(16);
      expect(bottom!.y - (board!.y + board!.height)).toBeGreaterThanOrEqual(0);
      expect(bottom!.y - (board!.y + board!.height)).toBeLessThanOrEqual(16);
      const material = await rows.first().getByRole("img").boundingBox();
      expect(material!.height).toBeGreaterThan(0);
    }).toPass();
    await page.setViewportSize({ width: 1280, height: 900 });
  }
});

test("engine handoff stays on the branch, rewinding restores the database, and settings fit mobile", async ({
  page,
}) => {
  const requestedFens: string[] = [];
  await page.route("**/api/opening-explorer?**", (route) => {
    const fen = new URL(route.request().url()).searchParams.get("fen") ?? "";
    requestedFens.push(fen);
    const games = fen.includes("4P3") && fen.includes(" b ") ? 4 : 100;
    return route.fulfill({
      json: {
        moves: [
          { uci: "d2d4", games, whiteWins: games, blackWins: 0, draws: 0, avgOpponentRating: null },
        ],
        recentGames: [],
      },
    });
  });
  await page.route("**/api/atomicdb-analysis?**", (route) =>
    route.fulfill({ status: 404, json: {} }),
  );
  await page.route("**/engines/atomic-stockfish/*/atomic-stockfish.worker.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      headers: { "cross-origin-embedder-policy": "require-corp" },
      body: `const line = line => self.postMessage({type:"line",line}); let fen="";
      self.onmessage=({data})=>{ if(data.type==="initialize") self.postMessage({type:"ready"});
        if(data.type!=="command")return; const c=data.command;
        if(c==="isready")line("readyok"); if(c.startsWith("position fen "))fen=c.slice(13);
        if(c.startsWith("go ")){const move=fen.includes("5N2")?"b8c6":"e7e5";
          line("info depth 4 multipv 1 score cp 0 pv "+move);line("bestmove "+move);}};`,
    }),
  );
  await page.addInitScript(() => {
    const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    localStorage.setItem(
      "atomic-puzzles.practice.settings",
      JSON.stringify({
        side: "white",
        clockEnabled: false,
        engine: { strength: 12, speed: 1, minGames: 5 },
      }),
    );
    if (!localStorage.getItem("atomic-puzzles.practice.board")) {
      localStorage.setItem(
        "atomic-puzzles.practice.board",
        JSON.stringify({ fen, pgn: '[Variant "Atomic"]\n\n1. e4', line: 0, ply: 1 }),
      );
    }
    localStorage.setItem("atomic-puzzles.practice.moves-open", "false");
  });
  await page.goto("/practice");
  const fen = page.getByRole("textbox", { name: "FEN", exact: true });
  await expect(fen).toHaveValue(/4P3.* b /);
  await page.getByRole("button", { name: "Start game", exact: true }).click();
  await expect(fen).toHaveValue(/4p3\/4P3.* w /);
  const board = page.locator("cg-board");
  const bounds = await board.boundingBox();
  if (!bounds) throw Error("Practice board missing");
  for (const square of ["g1", "f3"]) {
    await page.mouse.click(
      bounds.x + ((square.charCodeAt(0) - 97 + 0.5) * bounds.width) / 8,
      bounds.y + ((8 - Number(square[1]) + 0.5) * bounds.height) / 8,
    );
  }
  await expect(fen).toHaveValue(/2n5.*5N2.* w /);
  expect(requestedFens.some((f) => f.includes("5N2"))).toBe(false);
  await page.reload();
  await expect(fen).toHaveValue(/2n5.*5N2.* w /);
  expect(requestedFens.some((f) => f.includes("5N2"))).toBe(false);
  await page.getByRole("button", { name: "Go to start", exact: true }).click();
  await expect(fen).toHaveValue(/PPPPPPPP\/RNBQKBNR w /);
  await expect.poll(() => requestedFens.some((f) => f.includes("PPPPPPPP/RNBQKBNR w "))).toBe(true);
  await page.getByRole("button", { name: "Practice settings", exact: true }).click();
  await expect(page.getByRole("slider", { name: /^Strength/ })).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const threshold = page.getByRole("spinbutton", { name: /^Switch to engine/ });
    await threshold.scrollIntoViewIfNeeded();
    await expect(threshold).toBeVisible();
    const rect = await threshold.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
});
