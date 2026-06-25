import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import {
  buildOpeningExplorerSql,
  buildPositionPlayerLeaderBandsSql,
  buildPositionPlayerLeadersSql,
  lastMoveColorFromFen,
  OPENING_EXPLORER_RESPONSE_SCHEMA,
  positionKeyHex,
  sqlMonthBounds,
  toPositionPlayerLeadersPayload,
} from "./opening-explorer-sql.js";

const execFileAsync = promisify(execFile);
const PLAYER_MIN_RATING = 1700;
const MAX_EXPLORER_RATING = 2200;

const parsePlayerMinRating = (value) => {
  const rating = Number.parseInt(value ?? String(PLAYER_MIN_RATING), 10);
  if (!Number.isFinite(rating)) return PLAYER_MIN_RATING;
  return Math.max(PLAYER_MIN_RATING, Math.min(MAX_EXPLORER_RATING, rating));
};

const openingExplorerPlugin = () => {
  const dbPath = resolve(process.cwd(), "data/openings.sqlite");
  const cache = new Map();
  const aliasCache = new Map();

  const dbSignature = () => {
    try {
      const stats = statSync(dbPath);
      return `${stats.mtimeMs}:${stats.size}`;
    } catch {
      return "missing";
    }
  };

  const resolveCanonicalUsername = async (username, signature) => {
    if (!username) return "";

    const cachedAliases = aliasCache.get(signature);
    if (cachedAliases) {
      return cachedAliases.get(username) ?? username;
    }

    const aliases = new Map();

    try {
      const { stdout } = await execFileAsync("sqlite3", [
        "-cmd",
        ".timeout 10000",
        dbPath,
        "select value from opening_index_meta where key = 'aliases' limit 1;",
      ]);
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

  const fetchPositionPlayerLeaders = async (keyHex, lastMoveColor) => {
    if (lastMoveColor !== 0 && lastMoveColor !== 1) return null;

    try {
      const sqliteArgs = ["-json", "-cmd", ".timeout 10000", dbPath];
      const [{ stdout: leadersStdout }, { stdout: bandsStdout }] = await Promise.all([
        execFileAsync("sqlite3", [
          ...sqliteArgs,
          buildPositionPlayerLeadersSql(keyHex, lastMoveColor),
        ]),
        execFileAsync("sqlite3", [...sqliteArgs, buildPositionPlayerLeaderBandsSql()]),
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

    const fen = url.searchParams.get("fen")?.trim();
    if (!fen) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: "Missing fen query parameter" }));
      return;
    }

    const signature = dbSignature();
    const requestedUsername = url.searchParams.get("username")?.trim().toLowerCase() ?? "";
    const username = await resolveCanonicalUsername(requestedUsername, signature);
    const requestedOpponent = url.searchParams.get("opponent")?.trim().toLowerCase() ?? "";
    const opponent = username ? await resolveCanonicalUsername(requestedOpponent, signature) : "";
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
    const requestedSpeeds = (url.searchParams.get("speeds") ?? "0,1")
      .split(",")
      .map((speed) => Number.parseInt(speed, 10))
      .filter((speed) => speed === 0 || speed === 1);
    const speeds = requestedSpeeds.length ? [...new Set(requestedSpeeds)].sort() : [0, 1];
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
      res.end(cached);
      return;
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
    });

    try {
      const sqliteArgs = ["-json", "-cmd", ".timeout 10000", dbPath];
      const positionExtrasPromise = includePositionExtras
        ? fetchPositionPlayerLeaders(keyHex, lastMoveColor)
        : Promise.resolve(null);
      const [{ stdout: movesStdout }, { stdout: gamesStdout }, positionLeaders] = await Promise.all(
        [
          execFileAsync("sqlite3", [...sqliteArgs, movesSql]),
          execFileAsync("sqlite3", [...sqliteArgs, gamesSql]),
          positionExtrasPromise,
        ],
      );
      const body = JSON.stringify({
        positionKey: keyHex,
        positionLeaders,
        moves: JSON.parse(movesStdout.trim() || "[]"),
        recentGames: JSON.parse(gamesStdout.trim() || "[]"),
      });
      cache.set(cacheKey, body);
      res.end(body);
    } catch (error) {
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Opening explorer query failed",
        }),
      );
    }
  };

  return {
    name: "atomic-opening-explorer-api",
    enforce: "pre",
    configureServer(server) {
      console.log(
        `[opening-explorer] SQLite middleware mounted at /api/opening-explorer (${dbPath})`,
      );
      server.middlewares.use("/api/opening-explorer", handleOpeningExplorerRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/opening-explorer", handleOpeningExplorerRequest);
    },
  };
};

export default defineConfig({
  base: "/",
  plugins: [react(), openingExplorerPlugin()],
});
