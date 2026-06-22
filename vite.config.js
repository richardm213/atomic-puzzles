import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const execFileAsync = promisify(execFile);

const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;
const positionKeyHex = (fen) =>
  createHash("sha1").update(`atomic|${fen}`).digest("hex").slice(0, 32);
const sqlMonthBounds = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;

  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: year * 10000 + month * 100 + 1,
    end: year * 10000 + month * 100 + lastDay,
  };
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

  const handleOpeningExplorerRequest = async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/health" || url.pathname === "/api/opening-explorer/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          dbExists: existsSync(dbPath),
          dbSignature: dbSignature(),
          schema: "compact",
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
    const opponent = username
      ? await resolveCanonicalUsername(requestedOpponent, signature)
      : "";
    const color = url.searchParams.get("color") === "black" ? 1 : 0;
    const requestedRating = Number.parseInt(url.searchParams.get("minRating") ?? "1700", 10);
    const minRating = Math.max(
      1700,
      Math.min(2200, Number.isFinite(requestedRating) ? requestedRating : 1700),
    );
    const startDate =
      sqlMonthBounds(url.searchParams.get("startDate")?.trim() ?? "")?.start ?? null;
    const endDate = sqlMonthBounds(url.searchParams.get("endDate")?.trim() ?? "")?.end ?? null;
    const requestedSpeeds = (url.searchParams.get("speeds") ?? "0,1")
      .split(",")
      .map((speed) => Number.parseInt(speed, 10))
      .filter((speed) => speed === 0 || speed === 1);
    const speeds = requestedSpeeds.length ? [...new Set(requestedSpeeds)].sort() : [0, 1];
    const keyHex = positionKeyHex(fen);
    const cacheKey = JSON.stringify({
      dbSignature: signature,
      fen,
      color,
      requestedUsername,
      username,
      requestedOpponent,
      opponent,
      minRating,
      speeds,
      startDate,
      endDate,
    });
    const cached = cache.get(cacheKey);
    if (cached) {
      res.end(cached);
      return;
    }

    const playerIdSql = username
      ? `(select name_id from opening_names where lower(name) = ${sqlString(username)} limit 1)`
      : "";
    const opponentIdSql = opponent
      ? `(select name_id from opening_names where lower(name) = ${sqlString(opponent)} limit 1)`
      : "";
    const opponentIdColumn = color === 0 ? "black_id" : "white_id";
    const edgesPlayerSql = username ? `and canonical_player_id = ${playerIdSql}` : "";
    const gamesPlayerSql = username ? `and g.canonical_player_id = ${playerIdSql}` : "";
    const gamesOpponentSql = opponent ? `and g.${opponentIdColumn} = ${opponentIdSql}` : "";
    const edgesColorSql = `and player_color = ${color}`;
    const gamesColorSql = `and g.player_color = ${color}`;
    const speedSql = speeds.join(",");
    const edgesDateSql = `
      ${startDate ? `and played_on >= ${startDate}` : ""}
      ${endDate ? `and played_on <= ${endDate}` : ""}
    `;
    const gamesDateSql = `
      ${startDate ? `and g.played_on >= ${startDate}` : ""}
      ${endDate ? `and g.played_on <= ${endDate}` : ""}
    `;
    const edgesWhere = `
      position_key = X'${keyHex}'
      ${edgesColorSql}
      and speed in (${speedSql})
      ${edgesPlayerSql}
      ${edgesDateSql}
    `;
    const gamesWhere = `
      g.position_key = X'${keyHex}'
      ${gamesColorSql}
      and g.speed in (${speedSql})
      ${gamesPlayerSql}
      ${gamesOpponentSql}
      ${gamesDateSql}
    `;
    const opponentRatingColumn = color === 0 ? "g.black_rating" : "g.white_rating";
    const detailsRatingFilter = username
      ? `and ${opponentRatingColumn} >= ${minRating}`
      : `and ((g.white_rating + g.black_rating) / 2.0) >= ${minRating}`;
    const movesSql = opponent
      ? `
        select
          g.next_uci as uci,
          count(*) as games,
          sum(case when g.winner = 1 then 1 else 0 end) as whiteWins,
          sum(case when g.winner = 0 then 1 else 0 end) as draws,
          sum(case when g.winner = 2 then 1 else 0 end) as blackWins,
          round(avg(${opponentRatingColumn})) as avgOpponentRating
        from opening_position_games g
        where ${gamesWhere}
          ${detailsRatingFilter}
        group by g.next_uci
        order by games desc
        limit 12;
      `
      : `
        select
          next_uci as uci,
          sum(games) as games,
          sum(white_wins) as whiteWins,
          sum(draws) as draws,
          sum(black_wins) as blackWins,
          round(sum(opponent_rating_sum) * 1.0 / sum(games)) as avgOpponentRating
        from opening_edges_daily
        where ${edgesWhere}
          and (opponent_rating_sum * 1.0 / games) >= ${minRating}
        group by next_uci
        order by games desc
        limit 12;
      `;
    const gamesGroupSql = username ? "" : "group by g.game_id, g.next_uci";
    const gamesSql = `
      select
        g.next_uci as uci,
        g.game_id as gameId,
        g.played_at as playedAt,
        g.played_on as playedOn,
        white_name.name as white,
        black_name.name as black,
        g.white_rating as whiteRating,
        g.black_rating as blackRating,
        g.winner as winner
      from opening_position_games g
      left join opening_names white_name on white_name.name_id = g.white_id
      left join opening_names black_name on black_name.name_id = g.black_id
      where ${gamesWhere}
        ${detailsRatingFilter}
      ${gamesGroupSql}
      order by g.played_at desc
      limit 8;
    `;

    try {
      const sqliteArgs = ["-json", "-cmd", ".timeout 10000", dbPath];
      const { stdout: movesStdout } = await execFileAsync("sqlite3", [...sqliteArgs, movesSql]);
      const { stdout: gamesStdout } = await execFileAsync("sqlite3", [...sqliteArgs, gamesSql]);
      const body = JSON.stringify({
        positionKey: keyHex,
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
