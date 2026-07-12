import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import {
  createOpeningExplorerQueue,
  createPriorityFactory,
  OpeningExplorerQueueError,
} from "./opening-explorer-request-queue.js";
import {
  buildGeneralSavedStatusSql,
  buildOpeningExplorerSql,
  buildOpeningPlayersSql,
  buildPositionPlayerLeaderBandsSql,
  buildPositionPlayerLeadersSql,
  buildRandomOpeningPlayerSql,
  lastMoveColorFromFen,
  OPENING_EXPLORER_RESPONSE_SCHEMA,
  positionKeyHex,
  selectGeneralExplorerSources,
  sqlMonthBounds,
  toPositionPlayerLeadersPayload,
} from "./opening-explorer-sql.js";

const execFileAsync = promisify(execFile);
const PLAYER_MIN_RATING = 1700;
const MAX_EXPLORER_RATING = 2200;
const MAX_SQLITE_CONCURRENT_QUERIES = 3;
const MAX_SQLITE_QUEUED_QUERIES = 36;
const HIGH_VOLUME_GENERAL_CACHE_MIN_GAMES = 1_000;

const parsePlayerMinRating = (value) => {
  const rating = Number.parseInt(value ?? String(PLAYER_MIN_RATING), 10);
  if (!Number.isFinite(rating)) return PLAYER_MIN_RATING;
  return Math.max(PLAYER_MIN_RATING, Math.min(MAX_EXPLORER_RATING, rating));
};

const openingExplorerPlugin = () => {
  const dbPath = resolve(process.cwd(), "data/openings.sqlite");
  const cache = new Map();
  const pendingCache = new Map();
  const aliasCache = new Map();
  const nextSqlitePriority = createPriorityFactory();
  const sqliteQueue = createOpeningExplorerQueue({
    maxConcurrent: MAX_SQLITE_CONCURRENT_QUERIES,
    maxQueued: MAX_SQLITE_QUEUED_QUERIES,
  });
  const enqueueSqliteQuery = (run, priorityRef) => sqliteQueue.enqueue(run, priorityRef);

  const shouldCacheExplorerResponse = ({ moves, opponent, username }) => {
    if (username || opponent) return false;

    const shownGames = moves.reduce((total, row) => total + Number(row.games ?? 0), 0);
    return shownGames >= HIGH_VOLUME_GENERAL_CACHE_MIN_GAMES;
  };

  const setExplorerCacheHeader = (res, shouldCache) => {
    res.setHeader("Cache-Control", shouldCache ? "public, max-age=30" : "no-store");
  };

  const dbSignature = () => {
    try {
      const stats = statSync(dbPath);
      return `${stats.mtimeMs}:${stats.size}`;
    } catch {
      return "missing";
    }
  };

  const resolveCanonicalUsername = async (username, signature, priorityRef) => {
    if (!username) return "";

    const cachedAliases = aliasCache.get(signature);
    if (cachedAliases) {
      return cachedAliases.get(username) ?? username;
    }

    const aliases = new Map();

    try {
      const { stdout } = await enqueueSqliteQuery(
        () =>
          execFileAsync("sqlite3", [
            "-cmd",
            ".timeout 10000",
            dbPath,
            "select value from opening_index_meta where key = 'aliases' limit 1;",
          ]),
        priorityRef,
      );
      const rawAliases = JSON.parse(stdout.trim() || "{}");

      if (rawAliases && typeof rawAliases === "object" && !Array.isArray(rawAliases)) {
        for (const [alias, canonical] of Object.entries(rawAliases)) {
          const aliasKey = String(alias).trim().toLowerCase();
          const canonicalValue = String(canonical).trim().toLowerCase();
          if (aliasKey && canonicalValue) aliases.set(aliasKey, canonicalValue);
        }
      }
    } catch {
      // Older local databases do not include alias metadata.
    }

    aliasCache.set(signature, aliases);
    return aliases.get(username) ?? username;
  };

  const fetchPositionPlayerLeaders = async (keyHex, lastMoveColor, priorityRef) => {
    if (lastMoveColor !== 0 && lastMoveColor !== 1) return null;

    try {
      const sqliteArgs = ["-json", "-cmd", ".timeout 10000", dbPath];
      const [{ stdout: leadersStdout }, { stdout: bandsStdout }] = await Promise.all([
        enqueueSqliteQuery(
          () =>
            execFileAsync("sqlite3", [
              ...sqliteArgs,
              buildPositionPlayerLeadersSql(keyHex, lastMoveColor),
            ]),
          priorityRef,
        ),
        enqueueSqliteQuery(
          () => execFileAsync("sqlite3", [...sqliteArgs, buildPositionPlayerLeaderBandsSql()]),
          priorityRef,
        ),
      ]);
      const leaderRows = JSON.parse(leadersStdout.trim() || "[]");
      const bandRows = JSON.parse(bandsStdout.trim() || "[]");

      return toPositionPlayerLeadersPayload(leaderRows, bandRows[0]?.value);
    } catch {
      // Older local opening databases do not include position-player leader tables.
      return null;
    }
  };

  const handleOpeningExplorerRequest = async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/health" || url.pathname === "/api/opening-explorer/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          dbExists: existsSync(dbPath),
          dbSignature: dbSignature(),
          schema: OPENING_EXPLORER_RESPONSE_SCHEMA,
        }),
      );
      return;
    }

    if (url.pathname !== "/" && url.pathname !== "/api/opening-explorer") {
      next();
      return;
    }

    res.setHeader("Content-Type", "application/json");

    if (!existsSync(dbPath)) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: "data/openings.sqlite was not found" }));
      return;
    }

    if (url.searchParams.get("players") === "1") {
      try {
        const { stdout } = await enqueueSqliteQuery(
          () =>
            execFileAsync("sqlite3", [
              "-json",
              "-cmd",
              ".timeout 10000",
              dbPath,
              buildOpeningPlayersSql(),
            ]),
          nextSqlitePriority("visible"),
        );
        const players = JSON.parse(stdout.trim() || "[]")
          .map((player) => String(player.username ?? "").trim())
          .filter(Boolean);
        res.end(JSON.stringify({ players }));
      } catch (error) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error:
              error instanceof Error ? error.message : "Could not load opening database players",
          }),
        );
      }
      return;
    }

    if (url.searchParams.get("randomPlayer") === "1") {
      try {
        const { stdout } = await enqueueSqliteQuery(
          () =>
            execFileAsync("sqlite3", [
              "-json",
              "-cmd",
              ".timeout 10000",
              dbPath,
              buildRandomOpeningPlayerSql(),
            ]),
          nextSqlitePriority("visible"),
        );
        const [player = {}] = JSON.parse(stdout.trim() || "[]");
        const username = String(player.username ?? "").trim();
        res.statusCode = username ? 200 : 404;
        res.end(
          JSON.stringify(
            username ? { username } : { error: "No opening database players are available" },
          ),
        );
      } catch (error) {
        res.statusCode = 500;
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Could not select a random player",
          }),
        );
      }
      return;
    }

    const fen = url.searchParams.get("fen")?.trim();
    if (!fen) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Missing fen query parameter" }));
      return;
    }

    const signature = dbSignature();
    const requestIntent =
      typeof req.headers["x-explorer-intent"] === "string" ? req.headers["x-explorer-intent"] : "";
    const priorityRef = nextSqlitePriority(requestIntent);
    const requestedUsername = url.searchParams.get("username")?.trim().toLowerCase() ?? "";
    const username = await resolveCanonicalUsername(requestedUsername, signature, priorityRef);
    const requestedOpponent = url.searchParams.get("opponent")?.trim().toLowerCase() ?? "";
    const opponent = username
      ? await resolveCanonicalUsername(requestedOpponent, signature, priorityRef)
      : "";
    const requestedColor =
      url.searchParams.get("color") === "white"
        ? 0
        : url.searchParams.get("color") === "black"
          ? 1
          : "all";
    const color = username && requestedColor === "all" ? 0 : requestedColor;
    const playerMinRating = username
      ? parsePlayerMinRating(url.searchParams.get("minRating"))
      : null;
    const queryMinRating = playerMinRating ?? PLAYER_MIN_RATING;
    const startDate =
      sqlMonthBounds(url.searchParams.get("startDate")?.trim() ?? "")?.start ?? null;
    const endDate = sqlMonthBounds(url.searchParams.get("endDate")?.trim() ?? "")?.end ?? null;
    const requestedSpeeds = (url.searchParams.get("speeds") ?? "0,1,2")
      .split(",")
      .map((speed) => Number.parseInt(speed, 10))
      .filter((speed) => speed === 0 || speed === 1 || speed === 2);
    const speeds = requestedSpeeds.length ? [...new Set(requestedSpeeds)].sort() : [0, 1, 2];
    const keyHex = positionKeyHex(fen);
    const lastMoveColor = lastMoveColorFromFen(fen);
    const includePositionExtras = !username;
    const cacheKey = JSON.stringify({
      responseSchema: OPENING_EXPLORER_RESPONSE_SCHEMA,
      dbSignature: signature,
      fen,
      color,
      requestedUsername,
      username,
      requestedOpponent,
      opponent,
      playerMinRating,
      speeds,
      startDate,
      endDate,
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      setExplorerCacheHeader(res, true);
      res.end(cached);
      return;
    }

    const pending = pendingCache.get(cacheKey);
    if (pending) {
      try {
        pending.priorityRef.value = Math.max(pending.priorityRef.value, priorityRef.value);
        const { body, shouldCache } = await pending.promise;
        setExplorerCacheHeader(res, shouldCache);
        res.end(body);
        return;
      } catch {
        // Run the query below if the shared pending request failed.
      }
    }

    try {
      const sqliteArgs = ["-json", "-cmd", ".timeout 10000", dbPath];
      const positionExtrasPromise = includePositionExtras
        ? fetchPositionPlayerLeaders(keyHex, lastMoveColor, priorityRef)
        : Promise.resolve(null);
      let generalSources = {};

      const bodyPromise = (async () => {
        if (!username && !opponent) {
          const { stdout: savedStatusStdout } = await enqueueSqliteQuery(
            () =>
              execFileAsync("sqlite3", [
                ...sqliteArgs,
                buildGeneralSavedStatusSql({ endDate, keyHex, speeds, startDate }),
              ]),
            priorityRef,
          );
          const [savedStatus = {}] = JSON.parse(savedStatusStdout.trim() || "[]");
          generalSources = selectGeneralExplorerSources({
            endDate,
            savedGames: Number(savedStatus.savedGames ?? 0),
            savedRecentGames: Number(savedStatus.savedRecentGames ?? 0),
            speeds,
            startDate,
          });
        }

        const { gamesSql, movesSql } = buildOpeningExplorerSql({
          color,
          endDate,
          keyHex,
          opponent,
          playerMinRating: queryMinRating,
          speeds,
          startDate,
          username,
          ...generalSources,
        });

        const [{ stdout: movesStdout }, { stdout: gamesStdout }, positionLeaders] =
          await Promise.all([
            enqueueSqliteQuery(
              () => execFileAsync("sqlite3", [...sqliteArgs, movesSql]),
              priorityRef,
            ),
            enqueueSqliteQuery(
              () => execFileAsync("sqlite3", [...sqliteArgs, gamesSql]),
              priorityRef,
            ),
            positionExtrasPromise,
          ]);

        const moves = JSON.parse(movesStdout.trim() || "[]");
        const recentGames = JSON.parse(gamesStdout.trim() || "[]");

        return {
          body: JSON.stringify({
            positionKey: keyHex,
            positionLeaders,
            moves,
            recentGames,
          }),
          shouldCache: shouldCacheExplorerResponse({ moves, opponent, username }),
        };
      })();

      pendingCache.set(cacheKey, { promise: bodyPromise, priorityRef });
      const { body, shouldCache } = await bodyPromise;
      if (shouldCache) {
        cache.set(cacheKey, body);
      }
      setExplorerCacheHeader(res, shouldCache);
      res.end(body);
    } catch (error) {
      res.statusCode = error instanceof OpeningExplorerQueueError ? error.statusCode : 500;
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Opening explorer query failed",
        }),
      );
    } finally {
      pendingCache.delete(cacheKey);
    }
  };

  return {
    name: "atomic-opening-explorer-api",
    enforce: "pre",
    configureServer(server) {
      console.log(
        `[opening-explorer] SQLite middleware mounted at /api/opening-explorer (${dbPath})`,
      );
      server.middlewares.use("/api/opening-players", (req, res, next) => {
        req.url = "/?players=1";
        handleOpeningExplorerRequest(req, res, next);
      });
      server.middlewares.use("/api/opening-explorer", handleOpeningExplorerRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/opening-players", (req, res, next) => {
        req.url = "/?players=1";
        handleOpeningExplorerRequest(req, res, next);
      });
      server.middlewares.use("/api/opening-explorer", handleOpeningExplorerRequest);
    },
  };
};

export default defineConfig({
  base: "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react")) return "vendor-react";
          if (id.includes("@tanstack")) return "vendor-router";
          if (id.includes("chessops") || id.includes("chessground")) return "vendor-chess";
          if (id.includes("fortawesome")) return "vendor-icons";
          if (id.includes("supabase") || id.includes("libsql")) return "vendor-data";
          return undefined;
        },
      },
    },
  },
  plugins: [react(), openingExplorerPlugin()],
});
