// scripts/rebuild-atomic-tour-rankings.ts
import { createClient as createClient2 } from "@supabase/supabase-js";

// netlify/archive/client.ts
import { createClient } from "@libsql/client/web";
var archiveClient = null;
var getArchiveClient = () => {
  if (archiveClient) return archiveClient;
  const url = process.env.TURSO_MATCHES_DATABASE_URL?.trim() ?? "";
  const authToken = process.env.TURSO_MATCHES_AUTH_TOKEN?.trim() ?? "";
  if (!url || !authToken) {
    throw new Error("Turso match archive credentials are not configured");
  }
  archiveClient = createClient({ url, authToken });
  return archiveClient;
};

// netlify/archive/queries.ts
var MODE_IDS = {
  hyperbullet: 0,
  bullet: 1,
  blitz: 2,
  wolfrandom: 3,
  atomic960: 4
};
var SOURCE_IDS = {
  lobby: 0,
  arena: 1,
  friend: 2,
  swiss: 3,
  chesscom: 4,
  unknown: 5
};
var modeNameSql = (column) => `case ${column} when 0 then 'hyperbullet' when 1 then 'bullet' when 2 then 'blitz' when 3 then 'wolfrandom' when 4 then 'atomic960' else 'unknown' end`;
var MAX_PAGE_SIZE = 200;
var MAX_ROW_LIMIT = 1e4;
var RESOURCE_PARAMETERS = {
  matches: /* @__PURE__ */ new Set([
    "resource",
    "mode",
    "username",
    "pairA",
    "pairB",
    "matchId",
    "startTs",
    "endTs",
    "timeControl",
    "sources",
    "ratingMin",
    "ratingMax",
    "ratingFilterType",
    "page",
    "pageSize"
  ]),
  player_game_counts: /* @__PURE__ */ new Set(["resource", "username"]),
  latest_match: /* @__PURE__ */ new Set(["resource"]),
  aliases: /* @__PURE__ */ new Set(["resource", "username"]),
  weekly_ratings: /* @__PURE__ */ new Set(["resource", "username", "mode"]),
  ratings: /* @__PURE__ */ new Set(["resource", "username", "mode", "limit"]),
  leaderboard: /* @__PURE__ */ new Set(["resource", "month", "mode", "username", "limit"]),
  yearly_leaderboard: /* @__PURE__ */ new Set(["resource", "year", "mode"]),
  leaderboard_counts: /* @__PURE__ */ new Set(["resource"]),
  usernames: /* @__PURE__ */ new Set(["resource", "query", "exact"]),
  health: /* @__PURE__ */ new Set(["resource"])
};
var ArchiveRequestError = class extends Error {
};
var enumIdParam = (params, key, values) => {
  const value = String(params.get(key) ?? "").trim().toLowerCase();
  if (!value) return null;
  const id = values[value];
  if (id === void 0) throw new ArchiveRequestError(`Unsupported ${key}`);
  return id;
};
var numberParam = (params, key) => {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ArchiveRequestError(`${key} must be a finite number`);
  return value;
};
var boundedStringParam = (params, key, maximumLength) => {
  const value = String(params.get(key) ?? "").trim();
  if (value.length > maximumLength) {
    throw new ArchiveRequestError(`${key} must be at most ${maximumLength} characters`);
  }
  return value;
};
var positiveIntegerParam = (params, key, fallback, maximum) => {
  const value = numberParam(params, key) ?? fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ArchiveRequestError(`${key} must be a positive integer`);
  }
  return maximum === void 0 ? value : Math.min(value, maximum);
};
var optionalPositiveIntegerParam = (params, key, maximum) => {
  if (!params.has(key)) return 0;
  if (!params.get(key)?.trim()) throw new ArchiveRequestError(`${key} must be a positive integer`);
  return positiveIntegerParam(params, key, 1, maximum);
};
var validateResourceParameters = (params, resource) => {
  const allowed = RESOURCE_PARAMETERS[resource];
  if (!allowed) throw new ArchiveRequestError("Unknown archive resource");
  for (const key of params.keys()) {
    if (!allowed.has(key)) throw new ArchiveRequestError(`Unexpected query parameter: ${key}`);
  }
};
var normalizedRows = (rows) => Array.from(
  rows,
  (row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "bigint" ? Number(value) : value
    ])
  )
);
var queryMatches = async (params) => {
  const mode = enumIdParam(params, "mode", MODE_IDS);
  const clauses = [];
  const args = [];
  const page = positiveIntegerParam(params, "page", 1);
  const pageSize = positiveIntegerParam(params, "pageSize", 100, MAX_PAGE_SIZE);
  const emptyPage = {
    rows: [],
    total: 0,
    page,
    pageSize,
    totalPages: 0,
    hasPreviousPage: page > 1,
    hasNextPage: false
  };
  if (mode !== null) {
    clauses.push("m.mode = ?");
    args.push(mode);
  }
  const archive = getArchiveClient();
  const resolvePlayerId = async (username2) => {
    const result3 = await archive.execute({
      sql: "select id from players where username=? limit 1",
      args: [username2]
    });
    const value = Number(result3.rows[0]?.id);
    return Number.isSafeInteger(value) ? value : null;
  };
  const username = boundedStringParam(params, "username", 100).toLowerCase();
  const pairA = boundedStringParam(params, "pairA", 100).toLowerCase();
  const pairB = boundedStringParam(params, "pairB", 100).toLowerCase();
  const matchId = boundedStringParam(params, "matchId", 128);
  if (Boolean(pairA) !== Boolean(pairB)) {
    throw new ArchiveRequestError("pairA and pairB must be supplied together");
  }
  let usernamePlayerId = null;
  if (username) {
    usernamePlayerId = await resolvePlayerId(username);
    if (usernamePlayerId === null) return emptyPage;
  }
  if (pairA && pairB) {
    const [playerAId, playerBId] = await Promise.all([
      resolvePlayerId(pairA),
      resolvePlayerId(pairB)
    ]);
    if (playerAId === null || playerBId === null) return emptyPage;
    clauses.push(
      "((m.player_1_id = ? and m.player_2_id = ?) or (m.player_1_id = ? and m.player_2_id = ?))"
    );
    args.push(playerAId, playerBId, playerBId, playerAId);
  }
  if (matchId) {
    clauses.push("m.match_id = ?");
    args.push(matchId);
  }
  const startTs = numberParam(params, "startTs");
  const endTs = numberParam(params, "endTs");
  if (startTs !== null && endTs !== null && startTs > endTs) {
    throw new ArchiveRequestError("startTs must be less than or equal to endTs");
  }
  if (startTs !== null) {
    clauses.push("m.start_ts >= ?");
    args.push(startTs);
  }
  if (endTs !== null) {
    clauses.push("m.start_ts <= ?");
    args.push(endTs);
  }
  const timeControl = boundedStringParam(params, "timeControl", 40);
  if (timeControl && timeControl.toLowerCase() !== "all") {
    clauses.push("tc.value = ?");
    args.push(timeControl);
  }
  const sourcesSpecified = params.has("sources");
  const sourceValues = boundedStringParam(params, "sources", 100).split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (sourcesSpecified && sourceValues.length === 0) {
    clauses.push("0 = 1");
  } else if (sourceValues.length) {
    const sourceIds = sourceValues.map((source) => {
      if (!(source in SOURCE_IDS)) throw new ArchiveRequestError("Unsupported source");
      return SOURCE_IDS[source];
    });
    clauses.push(`m.source in (${sourceValues.map(() => "?").join(",")})`);
    args.push(...sourceIds);
  }
  const ratingMin = numberParam(params, "ratingMin");
  const ratingMax = numberParam(params, "ratingMax");
  if (ratingMin === null !== (ratingMax === null)) {
    throw new ArchiveRequestError("ratingMin and ratingMax must be supplied together");
  }
  if (params.has("ratingFilterType") && ratingMin === null) {
    throw new ArchiveRequestError("ratingFilterType requires ratingMin and ratingMax");
  }
  if (ratingMin !== null && ratingMax !== null && ratingMin > ratingMax) {
    throw new ArchiveRequestError("ratingMin must be less than or equal to ratingMax");
  }
  if (ratingMin !== null && ratingMax !== null) {
    const ratingFilterType = params.get("ratingFilterType") ?? "both";
    if (ratingFilterType !== "both" && ratingFilterType !== "average") {
      throw new ArchiveRequestError("ratingFilterType must be both or average");
    }
    if (ratingFilterType === "average") {
      clauses.push("(m.p1_after_rating + m.p2_after_rating) between ? and ?");
      args.push(ratingMin * 20, ratingMax * 20);
    } else {
      clauses.push("m.p1_after_rating between ? and ? and m.p2_after_rating between ? and ?");
      args.push(ratingMin * 10, ratingMax * 10, ratingMin * 10, ratingMax * 10);
    }
  }
  const where = clauses.length ? clauses.join(" and ") : "1 = 1";
  const selectMatch = `select m.match_id,${modeNameSql("m.mode")} mode,p1.username player_1,p2.username player_2,m.start_ts,tc.value time_control,
      case m.source when 0 then 'lobby' when 1 then 'arena' when 2 then 'friend' when 3 then 'swiss' when 4 then 'chesscom' else 'unknown' end source,
      m.tournament_id,m.games,m.p1_before_rating/10.0 p1_before_rating,m.p1_after_rating/10.0 p1_after_rating,
      m.p1_before_rd/10.0 p1_before_rd,m.p1_after_rd/10.0 p1_after_rd,m.p2_before_rating/10.0 p2_before_rating,
      m.p2_after_rating/10.0 p2_after_rating,m.p2_before_rd/10.0 p2_before_rd,m.p2_after_rd/10.0 p2_after_rd
      from matches m join players p1 on p1.id=m.player_1_id join players p2 on p2.id=m.player_2_id
      join time_controls tc on tc.id=m.time_control_id`;
  let countResult;
  let result2;
  if (usernamePlayerId !== null) {
    const playerOneWhere = `${where} and m.player_1_id = ?`;
    const playerTwoWhere = `${where} and m.player_2_id = ? and m.player_1_id <> ?`;
    const playerOneArgs = [...args, usernamePlayerId];
    const playerTwoArgs = [...args, usernamePlayerId, usernamePlayerId];
    countResult = await archive.execute({
      sql: `select sum(total) as total from (
        select count(*) as total from matches m join time_controls tc on tc.id=m.time_control_id where ${playerOneWhere}
        union all
        select count(*) as total from matches m join time_controls tc on tc.id=m.time_control_id where ${playerTwoWhere})`,
      args: [...playerOneArgs, ...playerTwoArgs]
    });
    result2 = await archive.execute({
      sql: `select * from (
        ${selectMatch} where ${playerOneWhere}
        union all
        ${selectMatch} where ${playerTwoWhere}
      ) order by start_ts desc limit ? offset ?`,
      args: [...playerOneArgs, ...playerTwoArgs, pageSize, (page - 1) * pageSize]
    });
  } else {
    countResult = await archive.execute({
      sql: `select count(*) as total from matches m join time_controls tc on tc.id=m.time_control_id where ${where}`,
      args
    });
    result2 = await archive.execute({
      sql: `${selectMatch} where ${where} order by m.start_ts desc limit ? offset ?`,
      args: [...args, pageSize, (page - 1) * pageSize]
    });
  }
  const rows = normalizedRows(result2.rows).map((row) => ({
    ...row,
    games: String(row.games ?? "").split("|").filter(Boolean)
  }));
  const total = Number(countResult.rows[0]?.total ?? rows.length);
  const totalPages = Math.ceil(total / pageSize);
  return {
    rows,
    total,
    page,
    pageSize,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages
  };
};
var queryAliases = async (params) => {
  const requested = boundedStringParam(params, "username", 100).toLowerCase();
  const archive = getArchiveClient();
  let canonical = requested;
  if (requested) {
    const resolved = await archive.execute({
      sql: "select p.username from aliases a join players p on p.id=a.player_id where a.alias=? limit 1",
      args: [requested]
    });
    canonical = String(resolved.rows[0]?.username ?? requested);
  }
  const botColumn = await archive.execute(
    "select 1 as present from pragma_table_info('aliases') where name='bot' limit 1"
  );
  const botSelection = botColumn.rows.length > 0 ? "a.bot" : "0 as bot";
  const result2 = await archive.execute({
    sql: `select a.alias,p.username,a.banned,${botSelection},a.count_games,a.openings from aliases a
      join players p on p.id=a.player_id ${canonical ? "where p.username=?" : ""} order by p.username,a.alias`,
    args: canonical ? [canonical] : []
  });
  return normalizedRows(result2.rows).map((row) => ({
    ...row,
    banned: Boolean(row.banned),
    bot: Boolean(row.bot)
  }));
};
var queryRatings = async (params) => {
  const clauses = [];
  const args = [];
  const mode = enumIdParam(params, "mode", MODE_IDS);
  if (mode !== null) {
    clauses.push("r.mode=?");
    args.push(mode);
  }
  const username = boundedStringParam(params, "username", 100).toLowerCase();
  if (username) {
    clauses.push("p.username=?");
    args.push(username);
  }
  const limit = optionalPositiveIntegerParam(params, "limit", MAX_ROW_LIMIT);
  const result2 = await getArchiveClient().execute({
    sql: `select p.username,r.rating/10.0 rating,r.peak/10.0 peak,r.peak_date,r.rd/10.0 rd,r.games,
      ${modeNameSql("r.mode")} tc,
      r.rank,r.top20_wins from player_ratings r join players p on p.id=r.username_id
      ${clauses.length ? `where ${clauses.join(" and ")}` : ""} order by r.rank${limit ? " limit ?" : ""}`,
    args: limit ? [...args, limit] : args
  });
  return normalizedRows(result2.rows);
};
var queryWeeklyRatings = async (params) => {
  const username = boundedStringParam(params, "username", 100).toLowerCase();
  if (!username) throw new ArchiveRequestError("Weekly ratings require a username");
  const mode = enumIdParam(params, "mode", MODE_IDS);
  const result2 = await getArchiveClient().execute({
    sql: `select p.username,r.week,r.rating/10.0 rating,r.rd/10.0 rd,r.games,
      ${modeNameSql("r.mode")} tc from weekly_ratings r
      join players p on p.id=r.username_id
      where p.username=?${mode !== null ? " and r.mode=?" : ""} order by r.week,r.mode`,
    args: mode !== null ? [username, mode] : [username]
  });
  return normalizedRows(result2.rows);
};
var queryLeaderboard = async (params) => {
  const clauses = ["l.rank>0"];
  const args = [];
  const month = boundedStringParam(params, "month", 10);
  if (month && !/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(month)) {
    throw new ArchiveRequestError("month must be the first day of a month in YYYY-MM-01 format");
  }
  if (month) {
    clauses.push("l.month=?");
    args.push(month);
  }
  const mode = enumIdParam(params, "mode", MODE_IDS);
  if (mode !== null) {
    clauses.push("l.mode=?");
    args.push(mode);
  }
  const username = boundedStringParam(params, "username", 100).toLowerCase();
  if (username) {
    clauses.push("p.username=?");
    args.push(username);
  }
  const limit = optionalPositiveIntegerParam(params, "limit", MAX_ROW_LIMIT);
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const result2 = await getArchiveClient().execute({
    sql: `select p.username,l.month,l.rank,l.rating/10.0 rating,l.rd/10.0 rd,l.games,
      ${modeNameSql("l.mode")} tc
      from lb l join players p on p.id=l.username_id ${where} order by l.month,l.mode,l.rank${limit ? " limit ?" : ""}`,
    args: limit ? [...args, limit] : args
  });
  return normalizedRows(result2.rows);
};
var queryLeaderboardCounts = async () => {
  const result2 = await getArchiveClient().execute(`select month month_value,
    ${modeNameSql("mode")} mode,
    count(*) player_count from lb where rank>0 group by month,mode`);
  return normalizedRows(result2.rows);
};
var queryYearlyLeaderboard = async (params) => {
  const clauses = ["l.rank>0"];
  const args = [];
  const yearValue = numberParam(params, "year");
  if (yearValue !== null && (!Number.isSafeInteger(yearValue) || yearValue < 2e3 || yearValue > 3e3)) {
    throw new ArchiveRequestError("year must be an integer from 2000 through 3000");
  }
  const year = yearValue ?? 0;
  if (year) {
    clauses.push("l.year=?");
    args.push(year);
  }
  const mode = enumIdParam(params, "mode", MODE_IDS);
  if (mode !== null) {
    if (mode > MODE_IDS.blitz) throw new ArchiveRequestError("Unsupported yearly leaderboard mode");
    clauses.push("l.mode=?");
    args.push(mode);
  }
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const result2 = await getArchiveClient().execute({
    sql: `select p.username,l.year,l.rank,l.rating/10.0 rating,l.games,
      ${modeNameSql("l.mode")} tc from yearly_lb l join players p on p.id=l.username_id
      ${where} order by l.year,l.mode,l.rank`,
    args
  });
  return normalizedRows(result2.rows);
};
var queryUsernames = async (params) => {
  const query = boundedStringParam(params, "query", 100).toLowerCase();
  const exact = boundedStringParam(params, "exact", 100).toLowerCase();
  if (exact) {
    const result3 = await getArchiveClient().execute({
      sql: "select username from players where username=? limit 1",
      args: [exact]
    });
    return normalizedRows(result3.rows);
  }
  if (query.length < 3) return [];
  const result2 = await getArchiveClient().execute({
    sql: `select username from players where username like ?
      order by case when username=? then 0 when username like ? then 1 else 2 end,length(username),username limit 36`,
    args: [`%${query}%`, query, `${query}%`]
  });
  return normalizedRows(result2.rows);
};
var queryArchiveResource = async (params) => {
  const resource = boundedStringParam(params, "resource", 50);
  validateResourceParameters(params, resource);
  if (resource === "matches") return queryMatches(params);
  if (resource === "player_game_counts") {
    const username = boundedStringParam(params, "username", 100).toLowerCase();
    if (!username) throw new ArchiveRequestError("Username is required");
    const result2 = await getArchiveClient().execute({
      sql: `select ${modeNameSql("m.mode")} mode,
        sum(case when trim(coalesce(m.games, ''), '|') = '' then 0
          else length(trim(m.games, '|')) - length(replace(trim(m.games, '|'), '|', '')) + 1 end) games
        from matches m
        where (m.player_1_id = (select id from players where username = ?)
          or m.player_2_id = (select id from players where username = ?))
          and m.mode in (0, 1, 2)
        group by m.mode`,
      args: [username, username]
    });
    return normalizedRows(result2.rows);
  }
  if (resource === "latest_match") {
    const result2 = await getArchiveClient().execute(
      "select max(start_ts) as start_ts from matches"
    );
    const timestamp = result2.rows[0]?.start_ts;
    return { start_ts: timestamp === null || timestamp === void 0 ? null : Number(timestamp) };
  }
  if (resource === "aliases") return queryAliases(params);
  if (resource === "weekly_ratings") return queryWeeklyRatings(params);
  if (resource === "ratings") return queryRatings(params);
  if (resource === "leaderboard") return queryLeaderboard(params);
  if (resource === "yearly_leaderboard") return queryYearlyLeaderboard(params);
  if (resource === "leaderboard_counts") return queryLeaderboardCounts();
  if (resource === "usernames") return queryUsernames(params);
  if (resource === "health") {
    const result2 = await getArchiveClient().execute(
      "select value from metadata where key='schema_version'"
    );
    return { ok: true, schemaVersion: String(result2.rows[0]?.value ?? "") };
  }
  throw new ArchiveRequestError("Unknown archive resource");
};

// src/lib/atomicTour/scoring.ts
var stagePercentages = {
  entered: 0.01,
  "round-of-64": 0.02,
  "round-of-32": 0.05,
  "round-of-16": 0.09,
  quarterfinal: 0.18,
  semifinal: 0.36,
  "winners-final": 0.48,
  final: 0.6,
  champion: 1
};
var stageOrder = [
  "entered",
  "round-of-64",
  "round-of-32",
  "round-of-16",
  "quarterfinal",
  "semifinal",
  "winners-final",
  "final",
  "champion"
];
var atomicTourStageForRound = (round, hasChampionshipMatch = false) => {
  const normalized = round.trim().toLowerCase();
  if (normalized.includes("grand final")) return "final";
  if (normalized === "finals" || normalized === "final")
    return hasChampionshipMatch ? "winners-final" : "final";
  if (normalized.includes("semifinal")) return "semifinal";
  if (normalized.includes("quarterfinal")) return "quarterfinal";
  if (normalized.includes("round of 16")) return "round-of-16";
  if (normalized.includes("round of 32")) return "round-of-32";
  if (normalized.includes("round of 64")) return "round-of-64";
  return "entered";
};
var atomicTourStageForFinalRank = (rank) => {
  if (!Number.isInteger(rank) || rank < 1) return null;
  if (rank === 1) return "champion";
  if (rank === 2) return "final";
  if (rank <= 4) return "semifinal";
  if (rank <= 8) return "quarterfinal";
  if (rank <= 16) return "round-of-16";
  if (rank <= 32) return "round-of-32";
  return "round-of-64";
};
var atomicTourPlacementAfterChampionship = (earnedStage, championshipOutcome) => {
  if (championshipOutcome === "win") return "champion";
  if (championshipOutcome === "loss") return "final";
  return earnedStage;
};
var atomicTourMainStageForResults = (eventFirstStage, results) => {
  const orderedResults = [...results].sort(
    (left, right) => stageOrder.indexOf(left.stage) - stageOrder.indexOf(right.stage)
  );
  const decidedResults = orderedResults.filter(({ outcome }) => outcome !== "bye");
  const firstDecision = decidedResults[0];
  if (!firstDecision) return null;
  const firstDecisionIndex = stageOrder.indexOf(firstDecision.stage);
  const enteredViaBye = orderedResults.some(
    ({ stage, outcome }) => outcome === "bye" && stageOrder.indexOf(stage) < firstDecisionIndex
  );
  if (enteredViaBye && firstDecision.outcome === "loss") return eventFirstStage;
  return decidedResults.reduce((bestStage, result2) => {
    const resultStageIndex = stageOrder.indexOf(result2.stage);
    const earnedStage = result2.outcome === "win" ? stageOrder[Math.min(resultStageIndex + 1, stageOrder.length - 1)] : result2.stage;
    return stageOrder.indexOf(earnedStage) > stageOrder.indexOf(bestStage) ? earnedStage : bestStage;
  }, eventFirstStage);
};
var losersWinPercentages = [0.02, 0.03, 0.04, 0.05, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16];
var atomicTourLosersBracketRoundCount = losersWinPercentages.length;
var losersBracketStartOffsets = {
  entered: 0,
  "round-of-64": 0,
  "round-of-32": 2,
  "round-of-16": 4,
  quarterfinal: 6,
  semifinal: 8,
  "winners-final": 9,
  final: 9,
  champion: 9
};
var atomicTourEventPoints = {
  awc: 2e3,
  ccac: 2e3,
  ahc: 1e3,
  aoc: 1e3,
  wolfarena: 1e3
};
var atomicTourStagePoints = (tier, stage) => Math.round(tier * stagePercentages[stage]);
var atomicTourLosersBracketWinPoints = (tier, roundIndex, startStage = "round-of-64") => {
  const adjustedRoundIndex = roundIndex + (losersBracketStartOffsets[startStage] ?? 0);
  const percentage = losersWinPercentages[Math.min(Math.max(0, adjustedRoundIndex), losersWinPercentages.length - 1)];
  return Math.round(tier * percentage);
};
var calculateKnockoutTourPoints = ({
  tier,
  mainStage,
  losersBracketWinRounds = [],
  losersBracketStartStage = "round-of-64"
}) => {
  const basePoints = atomicTourStagePoints(tier, mainStage);
  if (losersBracketWinRounds.length === 0) {
    return { basePoints, bonusPoints: 0, totalPoints: basePoints };
  }
  const requestedBonus = losersBracketWinRounds.map(
    (roundIndex) => atomicTourLosersBracketWinPoints(tier, roundIndex, losersBracketStartStage)
  ).reduce((sum, points) => sum + points, 0);
  const bonusCeiling = mainStage === "champion" ? Math.round(tier * 0.1) : Math.min(
    atomicTourStagePoints(tier, stageOrder[stageOrder.indexOf(mainStage) + 1]) - basePoints - 1,
    Math.round(tier * 0.2)
  );
  const bonusPoints = Math.max(0, Math.min(requestedBonus, bonusCeiling));
  return { basePoints, bonusPoints, totalPoints: basePoints + bonusPoints };
};
var atomicChessLeagueTourPoints = (division, result2) => {
  if (result2 === "loss") return 0;
  const winPoints = division === "elite" ? 100 : 50;
  return result2 === "draw" ? winPoints / 2 : winPoints;
};

// src/lib/matches/atomicChessLeague.ts
var aclMainAliases = {
  chrissical: "judebaetorrens",
  nitrocoloraze: "lesha2002",
  rookgamestrategy: "opabinia",
  taisthuban: "thuban",
  timetoplayatomic: "quasabianth"
};
var getAtomicChessLeaguePlayerName = (player) => {
  const normalized = player.trim().toLowerCase();
  return aclMainAliases[normalized] ?? normalized;
};
var result = (resultValue, score2) => ({
  result: resultValue,
  score: score2
});
var aclRoundData = {
  "2-elite": [
    {
      number: 1,
      matchups: [
        {
          team1: "Natso and random 2200s",
          team2: "The JBTEAM",
          score1: "39%",
          score2: "61%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "stinkypotato",
              player2: "JudeBaeTorrens",
              score1: "1",
              score2: "5",
              matchId: "4hYonO6j"
            },
            {
              timeControl: "3+0",
              player1: "Natso",
              player2: "HowlinD",
              score1: "5.5",
              score2: "2.5",
              status: "unarchived"
            },
            {
              timeControl: "1+0",
              player1: "Rechesster",
              player2: "arinor0109",
              score1: "3",
              score2: "11",
              matchId: "mmmdW8Sg"
            },
            {
              timeControl: "\xBD+0",
              player1: "Quasabianth",
              player2: "AtomicBlunder",
              score1: "15",
              score2: "15",
              matchId: "mA4lngX1"
            }
          ]
        },
        {
          team1: "Hyper Addicts",
          team2: "Team Death",
          score1: "52%",
          score2: "48%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "JakeStateFarm",
              player2: "RabbieR",
              score1: "6",
              score2: "0",
              matchId: "WtKxG2jG"
            },
            {
              timeControl: "3+0",
              player1: "Maracker",
              player2: "NitroColoraze",
              score1: "2",
              score2: "6",
              matchId: "tiPlLQEE"
            },
            {
              timeControl: "1+0",
              player1: "StUdIeB",
              player2: "sircachetes",
              score1: "5.5",
              score2: "10.5",
              matchId: "99sg0e0k"
            },
            {
              timeControl: "\xBD+0",
              player1: "RKROUNIT",
              player2: "MaxwellsSilvrHammer",
              score1: "14.5",
              score2: "15.5",
              matchId: "oGLvWd3m"
            }
          ]
        }
      ]
    },
    {
      number: 2,
      matchups: [
        {
          team1: "Hyper Addicts",
          team2: "The JBTEAM",
          score1: "61%",
          score2: "39%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "JakeStateFarm",
              player2: "HowlinD",
              score1: "5",
              score2: "3",
              matchId: "0heNhomf"
            },
            {
              timeControl: "3+0",
              player1: "StUdIeB",
              player2: "JudeBaeTorrens",
              score1: "5",
              score2: "5",
              matchId: "4zSLyq1b"
            },
            {
              timeControl: "1+0",
              player1: "Maracker",
              player2: "arinor0109",
              score1: "10.5",
              score2: "3.5",
              matchId: "LpnCSmlx"
            },
            {
              timeControl: "\xBD+0",
              player1: "RKROUNIT",
              player2: "AtomicBlunder",
              score1: "16",
              score2: "12",
              matchId: "zTbFzhBh"
            }
          ]
        },
        {
          team1: "Natso and random 2200s",
          team2: "Team Death",
          score1: "56%",
          score2: "44%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "Natso",
              player2: "MaxwellsSilvrHammer",
              score1: "5",
              score2: "3",
              matchId: "3aFIMSeO"
            },
            {
              timeControl: "3+0",
              player1: "Quasabianth",
              player2: "RabbieR",
              score1: "7",
              score2: "3",
              matchId: "fIJoCI7j"
            },
            {
              timeControl: "1+0",
              player1: "stinkypotato",
              player2: "NitroColoraze",
              score1: "5",
              score2: "11",
              matchId: "HD3ARaLL"
            },
            {
              timeControl: "\xBD+0",
              player1: "Rechesster",
              player2: "sircachetes",
              score1: "16",
              score2: "10",
              matchId: "QslOpwRp"
            }
          ]
        }
      ]
    },
    {
      number: 3,
      matchups: [
        {
          team1: "Hyper Addicts",
          team2: "Natso and random 2200s",
          score1: "61%",
          score2: "39%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "JakeStateFarm",
              player2: "Natso",
              score1: "3.5",
              score2: "4.5",
              matchId: "p3Wy7yb6"
            },
            {
              timeControl: "3+0",
              player1: "StUdIeB",
              player2: "Quasabianth",
              score1: "6",
              score2: "4",
              matchId: "cna1BteU"
            },
            {
              timeControl: "1+0",
              player1: "Maracker",
              player2: "Rechesster",
              score1: "10",
              score2: "10",
              matchId: "HkqD5XJg"
            },
            {
              timeControl: "\xBD+0",
              player1: "RKROUNIT",
              player2: "stinkypotato",
              score1: "16.5",
              score2: "1.5",
              matchId: "wpfYk5Wf"
            }
          ]
        },
        {
          team1: "The JBTEAM",
          team2: "Team Death",
          score1: "52%",
          score2: "48%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "HowlinD",
              player2: "RabbieR",
              score1: "4.5",
              score2: "1.5",
              matchId: "CzUuxQRT"
            },
            {
              timeControl: "3+0",
              player1: "arinor0109",
              player2: "NitroColoraze",
              score1: "3",
              score2: "7",
              matchId: "FlyfkONl"
            },
            {
              timeControl: "1+0",
              player1: "AtomicBlunder",
              player2: "MaxwellsSilvrHammer",
              score1: "4",
              score2: "12",
              matchId: "miaBQBlN"
            },
            {
              timeControl: "\xBD+0",
              player1: "JudeBaeTorrens",
              player2: "sircachetes",
              score1: "16",
              score2: "4",
              matchId: "bVcd1lDY"
            }
          ]
        }
      ]
    }
  ],
  "2-challenger": [
    {
      number: 1,
      matchups: [
        {
          team1: "Pythons",
          team2: "Atomic Storm",
          score1: "43%",
          score2: "57%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "BoldyNeutral",
              player2: "BobbyOppenheimer1945",
              score1: "4",
              score2: "4",
              matchId: "ufQjGzFj"
            },
            {
              timeControl: "3+0",
              player1: "JuanC95",
              player2: "gage12",
              score1: "7",
              score2: "3",
              matchId: "sXHuO01C"
            },
            {
              timeControl: "1+2",
              player1: "VenusaurBeedrill",
              player2: "cycl1one",
              score1: "2.5",
              score2: "7.5",
              status: "unarchived"
            },
            {
              timeControl: "1+0",
              player1: "T-R-I-D-E-N-T",
              player2: "RaviharaV",
              score1: "5",
              score2: "11",
              matchId: "pQiXkvMX"
            },
            {
              timeControl: "\xBD+0",
              player1: "ArjanZS",
              player2: "imjustanotherbot",
              score1: "10.5",
              score2: "15.5",
              matchId: "tFN4ZKSE"
            }
          ]
        },
        {
          team1: "Orca",
          team2: "Team Cowboy",
          score1: "51%",
          score2: "49%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "Orcinus_Orca",
              player2: "DanDan2016",
              score1: "3.5",
              score2: "4.5",
              matchId: "ycOI1H5P"
            },
            {
              timeControl: "3+0",
              player1: "AbsolutelyTrash",
              player2: "accaesar",
              score1: "6",
              score2: "0",
              matchId: "tq85UrhV"
            },
            {
              timeControl: "1+2",
              player1: "MarcoTheTiger",
              player2: "francothefalcon",
              score1: "3",
              score2: "9",
              matchId: "a5lBBvFa"
            },
            {
              timeControl: "1+0",
              player1: "KNIGHTBLADE_123",
              player2: "StealYourKidney",
              score1: "6.5",
              score2: "11.5",
              matchId: "gancwDLD"
            },
            {
              timeControl: "\xBD+0",
              player1: "F55555",
              player2: "JanMeLons",
              score1: "15",
              score2: "15",
              matchId: "4aUv9mHh"
            }
          ]
        }
      ]
    },
    {
      number: 2,
      matchups: [
        {
          team1: "Orca",
          team2: "Atomic Storm",
          score1: "55%",
          score2: "45%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "Orcinus_Orca",
              player2: "gage12",
              score1: "6",
              score2: "2",
              matchId: "M9bZwby0"
            },
            {
              timeControl: "3+0",
              player1: "AbsolutelyTrash",
              player2: "RaviharaV",
              score1: "6.5",
              score2: "1.5",
              matchId: "hZoMItmc"
            },
            {
              timeControl: "1+2",
              player1: "KNIGHTBLADE_123",
              player2: "BobbyOppenheimer1945",
              score1: "4.5",
              score2: "7.5",
              matchId: "6QX6L8xY"
            },
            {
              timeControl: "1+0",
              player1: "MarcoTheTiger",
              player2: "cycl1one",
              score1: "9",
              score2: "11",
              matchId: "RQDBG6PV"
            },
            {
              timeControl: "\xBD+0",
              player1: "I-WIN-00",
              player2: "imjustanotherbot",
              score1: "10",
              score2: "16",
              matchId: "VNHF0RlQ"
            }
          ]
        },
        {
          team1: "Pythons",
          team2: "Team Cowboy",
          score1: "55%",
          score2: "45%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "VenusaurBeedrill",
              player2: "DanDan2016",
              score1: "5",
              score2: "3",
              matchId: "r6uGmNZy"
            },
            {
              timeControl: "3+0",
              player1: "JuanC95",
              player2: "accaesar",
              score1: "5.5",
              score2: "4.5",
              matchId: "8HWaO6eM"
            },
            {
              timeControl: "1+2",
              player1: "BoldyNeutral",
              player2: "francothefalcon",
              score1: "0",
              score2: "1",
              status: "forfeit"
            },
            {
              timeControl: "1+0",
              player1: "T-R-I-D-E-N-T",
              player2: "StealYourKidney",
              score1: "1",
              score2: "0",
              status: "forfeit"
            },
            {
              timeControl: "\xBD+0",
              player1: "ArjanZS",
              player2: "JanMeLons",
              score1: "16",
              score2: "12",
              matchId: "Rwe4Wm1p"
            }
          ]
        }
      ]
    },
    {
      number: 3,
      matchups: [
        {
          team1: "Orca",
          team2: "Pythons",
          score1: "54%",
          score2: "46%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "MarcoTheTiger",
              player2: "VenusaurBeedrill",
              score1: "2",
              score2: "6",
              status: "unarchived"
            },
            {
              timeControl: "3+0",
              player1: "AbsolutelyTrash",
              player2: "JuanC95",
              score1: "5.5",
              score2: "0.5",
              matchId: "jibs5oMI"
            },
            {
              timeControl: "1+2",
              player1: "Orcinus_Orca",
              player2: "SauceCooker7598",
              score1: "8",
              score2: "2",
              matchId: "6odFuwll"
            },
            {
              timeControl: "1+0",
              player1: "I-WIN-00",
              player2: "T-R-I-D-E-N-T",
              score1: "0.5",
              score2: "0.5",
              status: "declared"
            },
            {
              timeControl: "\xBD+0",
              player1: "KNIGHTBLADE_123",
              player2: "ArjanZS",
              score1: "4.5",
              score2: "15.5",
              matchId: "NGZ0YHUG"
            }
          ]
        },
        {
          team1: "Atomic Storm",
          team2: "Team Cowboy",
          score1: "54%",
          score2: "46%",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "BobbyOppenheimer1945",
              player2: "DanDan2016",
              score1: "2.5",
              score2: "5.5",
              matchId: "N4yyl5Ac"
            },
            {
              timeControl: "3+0",
              player1: "RaviharaV",
              player2: "accaesar",
              score1: "5",
              score2: "1",
              matchId: "8YPzoCal"
            },
            {
              timeControl: "1+2",
              player1: "",
              player2: "",
              score1: "",
              score2: "",
              status: "unplayed"
            },
            {
              timeControl: "1+0",
              player1: "cycl1one",
              player2: "francothefalcon",
              score1: "0",
              score2: "1",
              status: "forfeit"
            },
            {
              timeControl: "\xBD+0",
              player1: "imjustanotherbot",
              player2: "JanMeLons",
              score1: "1",
              score2: "0",
              status: "forfeit"
            }
          ]
        }
      ]
    }
  ],
  "1-elite": [
    {
      number: 1,
      matchups: [
        {
          team1: "Team Natso",
          team2: "Team RandoomPlayer",
          score1: "4",
          score2: "0",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "Natso",
              player2: "RandoomPlayer",
              score1: "6",
              score2: "0",
              matchId: "WAslTZGh"
            },
            {
              timeControl: "3+0",
              player1: "Rechesster",
              player2: "HowlinD",
              score1: "7",
              score2: "3",
              matchId: "cVCPhcpa"
            },
            {
              timeControl: "1+0",
              player1: "NeverOFzero",
              player2: "JakeStateFarm",
              score1: "15.5",
              score2: "4.5",
              matchId: "W1vdC7d9"
            },
            {
              timeControl: "\xBD+0",
              player1: "RKROUNIT",
              player2: "MaxwellsSilvrHammer",
              score1: "16",
              score2: "13",
              matchId: "sJpFRpq7"
            }
          ]
        },
        {
          team1: "Team Wolfram_EP",
          team2: "Team Ihatespammers",
          score1: "1",
          score2: "3",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "TAiSThuban",
              player2: "rabidknight",
              score1: "4.5",
              score2: "2.5",
              matchId: "2P3xM82P"
            },
            {
              timeControl: "3+0",
              player1: "Wolfram_EP",
              player2: "RookGameStrategy",
              score1: "4",
              score2: "6",
              matchId: "8lGBtX1e"
            },
            {
              timeControl: "1+0",
              player1: "Maracker",
              player2: "ihatespammers",
              score1: "8.5",
              score2: "11.5",
              matchId: "Oc2NmbdM"
            },
            {
              timeControl: "\xBD+0",
              player1: "Statham_13",
              player2: "chrissical",
              score1: "11.5",
              score2: "15.5",
              matchId: "ptdCg7AS"
            }
          ]
        }
      ]
    },
    {
      number: 2,
      matchups: [
        {
          team1: "Team Natso",
          team2: "Team Ihatespammers",
          score1: "2",
          score2: "2",
          tiebreak: true,
          boards: [
            {
              timeControl: "3+2",
              player1: "Rechesster",
              player2: "rabidknight",
              score1: "4",
              score2: "4",
              matchId: "L3ib3zWj"
            },
            {
              timeControl: "3+0",
              player1: "Natso",
              player2: "RookGameStrategy",
              score1: "6",
              score2: "4",
              matchId: "mQF1HJcR"
            },
            {
              timeControl: "1+0",
              player1: "NeverOFzero",
              player2: "ihatespammers",
              score1: "10",
              score2: "11",
              matchId: "cnSwKEAn"
            },
            {
              timeControl: "\xBD+0",
              player1: "RKROUNIT",
              player2: "chrissical",
              score1: "15",
              score2: "15",
              matchId: "73WRFGyB"
            }
          ]
        },
        {
          team1: "Team RandoomPlayer",
          team2: "Team Wolfram_EP",
          score1: "0",
          score2: "4",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "HowlinD",
              player2: "TAiSThuban",
              score1: "2.5",
              score2: "4.5",
              matchId: "uehJqJB9"
            },
            {
              timeControl: "3+0",
              player1: "JakeStateFarm",
              player2: "Wolfram_EP",
              score1: "4.5",
              score2: "5.5",
              matchId: "BBaWmRmA"
            },
            {
              timeControl: "1+0",
              player1: "RandoomPlayer",
              player2: "Maracker",
              score1: "8",
              score2: "12",
              matchId: "N0TPznkZ"
            },
            {
              timeControl: "\xBD+0",
              player1: "MaxwellsSilvrHammer",
              player2: "Statham_13",
              score1: "11.5",
              score2: "15.5",
              matchId: "BrgKT0kp"
            }
          ]
        }
      ]
    },
    {
      number: 3,
      matchups: [
        {
          team1: "Team Natso",
          team2: "Team Wolfram_EP",
          score1: "3",
          score2: "1",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "Natso",
              player2: "Wolfram_EP",
              score1: "3",
              score2: "5",
              matchId: "Q70JChkg"
            },
            {
              timeControl: "3+0",
              player1: "NeverOFzero",
              player2: "TAiSThuban",
              score1: "1",
              score2: "0",
              status: "forfeit"
            },
            {
              timeControl: "1+0",
              player1: "Rechesster",
              player2: "Maracker",
              score1: "12",
              score2: "8",
              matchId: "B20xf2hO"
            },
            {
              timeControl: "\xBD+0",
              player1: "RKROUNIT",
              player2: "Statham_13",
              score1: "16",
              score2: "4",
              matchId: "95X388HT"
            }
          ]
        },
        {
          team1: "Team RandoomPlayer",
          team2: "Team Ihatespammers",
          score1: "1\xBD",
          score2: "2\xBD",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "RandoomPlayer",
              player2: "rabidknight",
              score1: "4.5",
              score2: "2.5",
              matchId: "i3xDHkrj"
            },
            {
              timeControl: "3+0",
              player1: "MaxwellsSilvrHammer",
              player2: "RookGameStrategy",
              score1: "3",
              score2: "6",
              matchId: "etetWHWK"
            },
            {
              timeControl: "1+0",
              player1: "HowlinD",
              player2: "ihatespammers",
              score1: "\xBD",
              score2: "\xBD",
              status: "declared"
            },
            {
              timeControl: "\xBD+0",
              player1: "JakeStateFarm",
              player2: "chrissical",
              score1: "11",
              score2: "16",
              matchId: "ctXgtdnk"
            }
          ]
        }
      ]
    }
  ],
  "1-challenger": [
    {
      number: 1,
      matchups: [
        {
          team1: "Team ekulxam",
          team2: "Team average200",
          score1: "2\xBD",
          score2: "1\xBD",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "seaside_tiramisu",
              player2: "average200",
              score1: "5",
              score2: "3",
              matchId: "MDnOFdDV"
            },
            {
              timeControl: "3+0",
              player1: "StealYourKidney",
              player2: "sircachetes",
              score1: "5",
              score2: "5",
              matchId: "NSU7EH9Y"
            },
            {
              timeControl: "1+0",
              player1: "ekulxam",
              player2: "timetoplayatomic",
              score1: "11.5",
              score2: "8.5",
              matchId: "O5U6ctgS"
            },
            {
              timeControl: "\xBD+0",
              player1: "mike-bear",
              player2: "always_play_atomic",
              score1: "11",
              score2: "19",
              matchId: "d6D2qQLe"
            }
          ]
        },
        {
          team1: "Team RabbieR",
          team2: "Team F55555",
          score1: "2\xBD",
          score2: "1\xBD",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "DanDan2016",
              player2: "puddingbirne",
              score1: "5",
              score2: "3",
              matchId: "znN7KgLQ"
            },
            {
              timeControl: "3+0",
              player1: "RabbieR",
              player2: "fettuccini",
              score1: "6",
              score2: "3",
              matchId: "XmGX0OFE"
            },
            {
              timeControl: "1+0",
              player1: "StUdIeB",
              player2: "milky_way12",
              score1: "9.5",
              score2: "10.5",
              matchId: "sZaOk9s1"
            },
            {
              timeControl: "\xBD+0",
              player1: "bercerk_atim",
              player2: "F55555",
              score1: "\xBD",
              score2: "\xBD",
              status: "declared"
            }
          ]
        }
      ]
    },
    {
      number: 2,
      matchups: [
        {
          team1: "Team ekulxam",
          team2: "Team RabbieR",
          score1: "1",
          score2: "3",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "StealYourKidney",
              player2: "DanDan2016",
              score1: "1.5",
              score2: "4.5",
              matchId: "bs8nImRR"
            },
            {
              timeControl: "3+0",
              player1: "seaside_tiramisu",
              player2: "RabbieR",
              score1: "7",
              score2: "3",
              matchId: "FBt6fIs1"
            },
            {
              timeControl: "1+0",
              player1: "ekulxam",
              player2: "StUdIeB",
              score1: "7",
              score2: "13",
              matchId: "kiWdXVAQ"
            },
            {
              timeControl: "\xBD+0",
              player1: "mike-bear",
              player2: "bercerk_atim",
              score1: "8",
              score2: "15",
              matchId: "L7Q6NfwZ"
            }
          ]
        },
        {
          team1: "Team average200",
          team2: "Team F55555",
          score1: "2",
          score2: "2",
          tiebreak: true,
          boards: [
            {
              timeControl: "3+2",
              player1: "bijiy",
              player2: "fettuccini",
              score1: "6",
              score2: "2",
              status: "forfeit"
            },
            {
              timeControl: "3+0",
              player1: "average200",
              player2: "milky_way12",
              score1: "4.5",
              score2: "5.5",
              matchId: "TjRhbcqS"
            },
            {
              timeControl: "1+0",
              player1: "always_play_atomic",
              player2: "fji-467",
              score1: "12",
              score2: "8",
              matchId: "D0OyVzKm"
            },
            {
              timeControl: "\xBD+0",
              player1: "sircachetes",
              player2: "F55555",
              score1: "5",
              score2: "25",
              matchId: "CCAAeBT9"
            }
          ]
        }
      ]
    },
    {
      number: 3,
      matchups: [
        {
          team1: "Team RabbieR",
          team2: "Team average200",
          score1: "3",
          score2: "1",
          tiebreak: false,
          boards: [
            {
              timeControl: "3+2",
              player1: "DanDan2016",
              player2: "average200",
              score1: "5",
              score2: "1",
              matchId: "FVE8xkrc"
            },
            {
              timeControl: "3+0",
              player1: "RabbieR",
              player2: "bijiy",
              score1: "1.5",
              score2: "8.5",
              matchId: "2IFnsYhn"
            },
            {
              timeControl: "1+0",
              player1: "StUdIeB",
              player2: "sircachetes",
              score1: "10.5",
              score2: "6.5",
              matchId: "GEjZ7Wx0"
            },
            {
              timeControl: "\xBD+0",
              player1: "bercerk_atim",
              player2: "always_play_atomic",
              score1: "16",
              score2: "14",
              matchId: "5kgVXoZb"
            }
          ]
        },
        {
          team1: "Team ekulxam",
          team2: "Team F55555",
          score1: "2",
          score2: "2",
          tiebreak: true,
          boards: [
            {
              timeControl: "3+2",
              player1: "StealYourKidney",
              player2: "puddingbirne",
              score1: "1.5",
              score2: "4.5",
              matchId: "bctoB1Bm"
            },
            {
              timeControl: "3+0",
              player1: "seaside_tiramisu",
              player2: "fettuccini",
              score1: "8.5",
              score2: "1.5",
              matchId: "7FU3khZ8"
            },
            {
              timeControl: "1+0",
              player1: "ekulxam",
              player2: "milky_way12",
              score1: "8",
              score2: "12",
              matchId: "bxwc8Eco"
            },
            {
              timeControl: "\xBD+0",
              player1: "mike-bear",
              player2: "F55555",
              score1: "15.5",
              score2: "14.5",
              matchId: "4Kpw7Z1d"
            }
          ]
        }
      ]
    }
  ]
};
var atomicChessLeagueSeasons = [
  {
    number: 2,
    year: 2026,
    startDate: "2026-02-01",
    endDate: "2026-03-29",
    boardCount: 5,
    timeControls: ["3+2", "3+0", "1+2", "1+0", "\xBD+0"],
    resultsUrl: "https://lichess.org/@/HowlinD/blog/results-of-the-atomic-chess-league-season-2/7gpFMA6k",
    teamsUrl: "https://lichess.org/forum/team-the-atomic-chess-league/acl-season-2-registration?page=8",
    divisions: [
      {
        id: "elite",
        name: "Elite League",
        rounds: aclRoundData["2-elite"],
        teams: [
          {
            rank: 1,
            name: "Hyper Addicts",
            captain: "JakeStateFarm",
            players: ["JakeStateFarm", "RKROUNIT", "Maracker", "StUdIeB"],
            wins: 3,
            rounds: [result("Win", "52%"), result("Win", "61%"), result("Win", "61%")]
          },
          {
            rank: 2,
            name: "The JBTEAM",
            captain: "JudeBaeTorrens",
            players: ["JudeBaeTorrens", "HowlinD", "arinor0109", "AtomicBlunder"],
            wins: 2,
            rounds: [result("Win", "61%"), result("Loss", "39%"), result("Win", "52%")]
          },
          {
            rank: 3,
            name: "Natso and random 2200s",
            captain: "Natso",
            players: ["Natso", "Rechesster", "Quasabianth", "StinkyPotato"],
            wins: 1,
            rounds: [result("Loss", "39%"), result("Win", "56%"), result("Loss", "39%")]
          },
          {
            rank: 4,
            name: "Team Death",
            captain: "MaxwellsSilvrHammer",
            players: ["MaxwellsSilvrHammer", "NitroColoraze", "sircachetes", "RabbieR"],
            wins: 0,
            rounds: [result("Loss", "48%"), result("Loss", "44%"), result("Loss", "48%")]
          }
        ]
      },
      {
        id: "challenger",
        name: "Challenger League",
        rounds: aclRoundData["2-challenger"],
        teams: [
          {
            rank: 1,
            name: "Orca",
            captain: "Orcinus_Orca",
            players: [
              "Orcinus_Orca",
              "AbsolutelyTrash",
              "KNIGHTBLADE_123",
              "MarcoTheTiger",
              "F55555",
              "I-WIN-00"
            ],
            wins: 3,
            rounds: [result("Win", "51%"), result("Win", "55%"), result("Win", "54%")]
          },
          {
            rank: 2,
            name: "Atomic Storm",
            captain: "cycl1one",
            players: [
              "cycl1one",
              "imjustanotherbot",
              "RaviharaV",
              "gage12",
              "BobbyOppenheimer1945"
            ],
            wins: 2,
            rounds: [result("Win", "57%"), result("Loss", "45%"), result("Win", "54%")]
          },
          {
            rank: 3,
            name: "Pythons",
            captain: "ArjanZS",
            players: ["ArjanZS", "T-R-I-D-E-N-T", "BlackJack84", "JuanC95", "BoldyNeutral"],
            wins: 1,
            rounds: [result("Loss", "43%"), result("Win", "55%"), result("Loss", "46%")]
          },
          {
            rank: 4,
            name: "Team Cowboy",
            captain: "DanDan2016",
            players: ["DanDan2016", "JanMeLons", "StealYourKidney", "francothefalcon", "accaesar"],
            wins: 0,
            rounds: [result("Loss", "49%"), result("Loss", "45%"), result("Loss", "46%")]
          }
        ]
      }
    ]
  },
  {
    number: 1,
    year: 2025,
    startDate: "2025-07-01",
    endDate: "2025-08-30",
    boardCount: 4,
    timeControls: ["3+2", "3+0", "1+0", "\xBD+0"],
    resultsUrl: "https://lichess.org/@/HowlinD/blog/results-of-the-atomic-chess-league-season-1/diOodYbX",
    teamsUrl: "https://lichess.org/forum/team-the-atomic-chess-league/atomic-league-season-1",
    divisions: [
      {
        id: "elite",
        name: "Elite League",
        rounds: aclRoundData["1-elite"],
        teams: [
          {
            rank: 1,
            name: "Team Natso",
            captain: "Natso",
            players: ["Natso", "NeverofZero", "Rechesster", "RKROUNIT"],
            wins: 3,
            rounds: [result("Win", "4\u20130"), result("Win", "2\u20132 TB"), result("Win", "3\u20131")]
          },
          {
            rank: 2,
            name: "Team Ihatespammers",
            captain: "ihatespammers",
            players: ["ihatespammers", "rabidknight", "RookGameStrategy", "JudeBaeTorrens"],
            wins: 2,
            rounds: [result("Win", "3\u20131"), result("Loss", "2\u20132 TB"), result("Win", "2\xBD\u20131\xBD")]
          },
          {
            rank: 3,
            name: "Team Wolfram_EP",
            captain: "Wolfram_EP",
            players: ["Wolfram_EP", "TAiSThuban", "Statham_13", "Maracker"],
            wins: 1,
            rounds: [result("Loss", "1\u20133"), result("Win", "4\u20130"), result("Loss", "1\u20133")]
          },
          {
            rank: 4,
            name: "Team RandoomPlayer",
            captain: "RandoomPlayer",
            players: ["RandoomPlayer", "HowlinD", "MaxwellsSilvrHammer", "JakeStateFarm"],
            wins: 0,
            rounds: [result("Loss", "0\u20134"), result("Loss", "0\u20134"), result("Loss", "1\xBD\u20132\xBD")]
          }
        ]
      },
      {
        id: "challenger",
        name: "Challenger League",
        rounds: aclRoundData["1-challenger"],
        teams: [
          {
            rank: 1,
            name: "Team RabbieR",
            captain: "RabbieR",
            players: ["RabbieR", "DanDan2016", "StUdIeB", "bercerk_atim", "Jmilie"],
            wins: 3,
            rounds: [result("Win", "2\xBD\u20131\xBD"), result("Win", "3\u20131"), result("Win", "3\u20131")]
          },
          {
            rank: 2,
            name: "Team ekulxam",
            captain: "ekulxam",
            players: ["ekulxam", "seaside_tiramisu", "StealYourKidney", "mike-bear", "JurrYan"],
            wins: 2,
            rounds: [result("Win", "2\xBD\u20131\xBD"), result("Loss", "1\u20133"), result("Win", "2\u20132 TB")]
          },
          {
            rank: 3,
            name: "Team F55555",
            captain: "F55555",
            players: ["F55555", "puddingbirne", "milky_way12", "fettuccini", "fji-467"],
            wins: 1,
            rounds: [result("Loss", "1\xBD\u20132\xBD"), result("Win", "2\u20132 TB"), result("Loss", "2\u20132 TB")]
          },
          {
            rank: 4,
            name: "Team average200",
            captain: "average200",
            players: [
              "average200",
              "timetoplayatomic",
              "bijiy",
              "sircachetes",
              "always_play_atomic"
            ],
            wins: 0,
            rounds: [result("Loss", "1\xBD\u20132\xBD"), result("Loss", "2\u20132 TB"), result("Loss", "1\u20133")]
          }
        ]
      }
    ]
  }
];

// scripts/rebuild-atomic-tour-rankings.ts
var excludedPlayers = /* @__PURE__ */ new Set(["neverofzero", "thuban", "taisthuban", "jasos12"]);
var today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
var normalize = (value) => String(value ?? "").trim().toLowerCase();
var score = (value) => Number(value) || 0;
var addParticipant = (participants, tournamentId, value) => {
  const player = normalize(value);
  if (!player || player === "bye" || excludedPlayers.has(player)) return;
  const eventParticipants = participants.get(tournamentId) ?? /* @__PURE__ */ new Set();
  eventParticipants.add(player);
  participants.set(tournamentId, eventParticipants);
};
var addYears = (date, years) => {
  const value = /* @__PURE__ */ new Date(`${date}T00:00:00Z`);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value.toISOString().slice(0, 10);
};
var isChampionshipMatch = (match) => match.bracket === "grand_final" || match.round.trim().toLowerCase().includes("grand final");
var stageOrder2 = [
  "entered",
  "round-of-64",
  "round-of-32",
  "round-of-16",
  "quarterfinal",
  "semifinal",
  "winners-final",
  "final",
  "champion"
];
var laterStage = (left, right) => stageOrder2.indexOf(left) >= stageOrder2.indexOf(right) ? left : right;
var losersRoundOrder = (round) => {
  const normalized = round.trim().toLowerCase();
  const numberedRound = normalized.match(/round\s+(\d+)/);
  if (numberedRound) return Number(numberedRound[1]);
  if (normalized.includes("quarterfinal")) return 100;
  if (normalized.includes("semifinal")) return 101;
  if (normalized.includes("final")) return 102;
  return 0;
};
var winner = (match) => {
  if (score(match.s1) > score(match.s2)) return normalize(match.p1);
  if (score(match.s2) > score(match.s1)) return normalize(match.p2);
  return "";
};
var isBonusEligibleResult = (match) => {
  const playerOne = normalize(match.p1);
  const playerTwo = normalize(match.p2);
  return Boolean(
    playerOne && playerTwo && playerOne !== "bye" && playerTwo !== "bye" && winner(match)
  );
};
var normalizedArchiveId = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.split("/").filter(Boolean).at(-1) ?? raw;
};
var archiveDates = /* @__PURE__ */ new Map();
var matchDate = async (matchId, fallback) => {
  const normalizedId = normalizedArchiveId(matchId);
  if (!normalizedId) return fallback;
  const cached = archiveDates.get(normalizedId);
  if (cached) return cached;
  try {
    const result2 = await queryArchiveResource(
      new URLSearchParams({ resource: "matches", matchId: normalizedId, pageSize: "1" })
    );
    const timestamp = Number(result2.rows?.[0]?.start_ts);
    const resolved = Number.isFinite(timestamp) ? new Date(timestamp * 1e3).toISOString().slice(0, 10) : fallback;
    archiveDates.set(normalizedId, resolved);
    return resolved;
  } catch {
    return fallback;
  }
};
var expiryFor = (event, awardedOn, awcEvents) => {
  if (event.series_key !== "awc") return addYears(awardedOn, 2);
  const futureAwcs = awcEvents.filter((candidate) => candidate.start_date > event.start_date);
  return futureAwcs[1]?.end_date ?? addYears(awardedOn, 2);
};
var awardKey = (...parts) => parts.map((part) => normalize(part).replaceAll(/[^a-z0-9_-]+/g, "-")).filter(Boolean).join(":");
var knockoutAwards = async (event, matches, awcEvents) => {
  const tier = atomicTourEventPoints[event.series_key];
  if (!tier) return [];
  const fallbackDate = event.end_date ?? today;
  const playerStages = /* @__PURE__ */ new Map();
  const playerMainMatches = /* @__PURE__ */ new Map();
  const allMainMatches = matches.filter(
    (match) => match.bracket === "main" || match.bracket === "grand_final"
  );
  const championshipMatches = allMainMatches.filter(isChampionshipMatch);
  const playedChampionshipMatches = championshipMatches.filter((match) => winner(match)).sort((left, right) => {
    const leftIsReset = /reset/i.test(`${left.round} ${left.id}`);
    const rightIsReset = /reset/i.test(`${right.round} ${right.id}`);
    return Number(leftIsReset) - Number(rightIsReset) || left.order - right.order;
  });
  const championshipDecider = playedChampionshipMatches.at(-1);
  const hasChampionshipMatch = championshipMatches.length > 0;
  const losersRounds = [
    ...new Set(
      matches.filter((match) => match.bracket === "losers").map((match) => match.round.trim()).filter(Boolean)
    )
  ].sort((left, right) => losersRoundOrder(left) - losersRoundOrder(right));
  const mainMatches = allMainMatches.filter((match) => !isChampionshipMatch(match));
  const eventFirstStage = mainMatches.reduce((firstStage, match) => {
    const matchStage = atomicTourStageForRound(match.round, hasChampionshipMatch);
    return stageOrder2.indexOf(matchStage) < stageOrder2.indexOf(firstStage) ? matchStage : firstStage;
  }, "champion");
  const losersBracketPlayers = new Set(
    matches.filter((match) => match.bracket === "losers").flatMap((match) => [normalize(match.p1), normalize(match.p2)]).filter((player) => player && player !== "bye")
  );
  const losersBracketStartStage = mainMatches.reduce(
    (earliestStage, match) => {
      const matchWinner = winner(match);
      if (!matchWinner) return earliestStage;
      const playerOne = normalize(match.p1);
      const playerTwo = normalize(match.p2);
      const matchLoser = matchWinner === playerOne ? playerTwo : playerOne;
      if (!losersBracketPlayers.has(matchLoser)) return earliestStage;
      const feederStage = atomicTourStageForRound(match.round, hasChampionshipMatch);
      if (!earliestStage) return feederStage;
      return stageOrder2.indexOf(feederStage) < stageOrder2.indexOf(earliestStage) ? feederStage : earliestStage;
    },
    null
  );
  mainMatches.forEach((match) => {
    [match.p1, match.p2].map(normalize).filter(Boolean).forEach((player) => {
      if (player === "bye") return;
      playerStages.set(
        player,
        laterStage(
          playerStages.get(player) ?? "entered",
          atomicTourStageForRound(match.round, hasChampionshipMatch)
        )
      );
      const current = playerMainMatches.get(player) ?? [];
      current.push(match);
      playerMainMatches.set(player, current);
    });
  });
  championshipMatches.forEach((match) => {
    [match.p1, match.p2].map(normalize).filter((player) => player && player !== "bye").forEach((player) => {
      if (!playerStages.has(player)) playerStages.set(player, "final");
    });
  });
  const awards = [];
  for (const [player] of playerStages) {
    if (excludedPlayers.has(player)) continue;
    const sourceMatches = playerMainMatches.get(player) ?? [];
    const playerChampionshipMatches = championshipMatches.filter(
      (match) => normalize(match.p1) === player || normalize(match.p2) === player
    );
    const mainResults = sourceMatches.flatMap((match) => {
      const playerOne = normalize(match.p1);
      const playerTwo = normalize(match.p2);
      const opponent = playerOne === player ? playerTwo : playerOne;
      if (!opponent || opponent === "bye") {
        return [
          {
            stage: atomicTourStageForRound(match.round, hasChampionshipMatch),
            outcome: "bye"
          }
        ];
      }
      const matchWinner = winner(match);
      if (!matchWinner) return [];
      return [
        {
          stage: atomicTourStageForRound(match.round, hasChampionshipMatch),
          outcome: matchWinner === player ? "win" : "loss"
        }
      ];
    });
    let earnedStage = atomicTourMainStageForResults(eventFirstStage, mainResults);
    if (championshipDecider && [normalize(championshipDecider.p1), normalize(championshipDecider.p2)].includes(player)) {
      earnedStage = atomicTourPlacementAfterChampionship(
        earnedStage,
        winner(championshipDecider) === player ? "win" : "loss"
      );
    }
    if (!earnedStage) continue;
    const latestSource = [...sourceMatches, ...playerChampionshipMatches].filter((match) => {
      const playerOne = normalize(match.p1);
      const opponent = playerOne === player ? normalize(match.p2) : playerOne;
      return opponent && opponent !== "bye" && winner(match);
    }).sort(
      (left, right) => stageOrder2.indexOf(atomicTourStageForRound(right.round, hasChampionshipMatch)) - stageOrder2.indexOf(atomicTourStageForRound(left.round, hasChampionshipMatch)) || right.order - left.order
    )[0];
    const awardedOn = await matchDate(latestSource?.match_id ?? null, fallbackDate);
    const losersWins = matches.filter(
      (match) => match.bracket === "losers" && isBonusEligibleResult(match) && winner(match) === player
    );
    const pointBreakdown = calculateKnockoutTourPoints({
      tier,
      mainStage: earnedStage,
      losersBracketWinRounds: losersWins.map(
        (match) => Math.max(0, losersRounds.indexOf(match.round.trim()))
      ),
      losersBracketStartStage: losersBracketStartStage ?? "round-of-64"
    });
    awards.push({
      award_key: awardKey(event.id, player, "placement"),
      tournament_id: event.id,
      player_name: player,
      source_type: "placement",
      source_key: "placement",
      awarded_on: awardedOn,
      expires_on: expiryFor(event, awardedOn, awcEvents),
      points: pointBreakdown.basePoints,
      description: `${earnedStage.replaceAll("-", " ")} placement`
    });
    if (pointBreakdown.bonusPoints > 0) {
      const latestLosersWin = losersWins.sort((left, right) => right.order - left.order)[0];
      const bonusDate = await matchDate(latestLosersWin?.match_id ?? null, fallbackDate);
      awards.push({
        award_key: awardKey(event.id, player, "losers-bonus"),
        tournament_id: event.id,
        player_name: player,
        source_type: "losers_win",
        source_key: "losers-bonus",
        awarded_on: bonusDate,
        expires_on: expiryFor(event, bonusDate, awcEvents),
        points: pointBreakdown.bonusPoints,
        description: `${losersWins.length} losers-bracket ${losersWins.length === 1 ? "win" : "wins"}`
      });
    }
  }
  return awards;
};
var aclAwards = async (events) => {
  const awards = [];
  for (const season of atomicChessLeagueSeasons) {
    const event = events.get(`acl-s${season.number}`);
    if (!event) continue;
    for (const division of season.divisions) {
      for (const round of division.rounds) {
        for (const matchup of round.matchups) {
          for (const board of matchup.boards) {
            const playerOne = normalize(getAtomicChessLeaguePlayerName(board.player1));
            const playerTwo = normalize(getAtomicChessLeaguePlayerName(board.player2));
            const playerOneScore = Number(board.score1);
            const playerTwoScore = Number(board.score2);
            if (!playerOne || !playerTwo || !Number.isFinite(playerOneScore) || !Number.isFinite(playerTwoScore))
              continue;
            const result2 = playerOneScore === playerTwoScore ? "draw" : "win";
            const winningPlayers = result2 === "draw" ? [playerOne, playerTwo] : [playerOneScore > playerTwoScore ? playerOne : playerTwo];
            const points = atomicChessLeagueTourPoints(division.id, result2);
            const awardedOn = await matchDate(board.matchId ?? null, event.end_date ?? today);
            for (const player of winningPlayers) {
              if (excludedPlayers.has(player) || points <= 0) continue;
              const sourceKey = `round-${round.number}-${board.timeControl}-${playerOne}-${playerTwo}`;
              awards.push({
                award_key: awardKey(event.id, player, sourceKey),
                tournament_id: event.id,
                player_name: player,
                source_type: result2 === "draw" ? "acl_draw" : "acl_win",
                source_key: sourceKey,
                awarded_on: awardedOn,
                expires_on: addYears(awardedOn, 2),
                points,
                description: `${division.name} round ${round.number} ${result2}`
              });
            }
          }
        }
      }
    }
  }
  return awards;
};
var wolfarenaAwards = (event, payload) => {
  const rounds = Array.isArray(payload.rounds) ? payload.rounds : [];
  const lastRound = rounds.at(-1);
  const standings = Array.isArray(lastRound?.standings) ? lastRound.standings : [];
  const awardedOn = String(lastRound?.date ?? event.end_date ?? today);
  return standings.flatMap((raw) => {
    const standing = raw;
    const player = normalize(standing.player);
    const rank = Number(standing.rank);
    const stage = atomicTourStageForFinalRank(rank);
    if (!player || excludedPlayers.has(player) || !stage) return [];
    return [
      {
        award_key: awardKey(event.id, player, "placement"),
        tournament_id: event.id,
        player_name: player,
        source_type: "arena_placement",
        source_key: "placement",
        awarded_on: awardedOn,
        expires_on: addYears(awardedOn, 2),
        points: atomicTourStagePoints(1e3, stage),
        description: `Final rank ${rank}`
      }
    ];
  });
};
var requireEnvironment = (name) => {
  const value = process.env[name]?.trim() ?? "";
  if (!value) throw new Error(`${name} is required`);
  return value;
};
var run = async () => {
  const supabase = createClient2(
    requireEnvironment("VITE_SUPABASE_URL"),
    requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
  const [
    { data: catalog, error: catalogError },
    { data: matches, error: matchesError },
    { data: archives, error: archivesError }
  ] = await Promise.all([
    supabase.from("tournament_catalog").select("id,series_key,start_date,end_date"),
    supabase.from("tournament_matches").select("tournament,bracket,round,order,id,match_id,p1,p2,s1,s2,outcome_type"),
    supabase.from("tournament_archives").select("tournament_id,payload")
  ]);
  if (catalogError) throw catalogError;
  if (matchesError) throw matchesError;
  if (archivesError) throw archivesError;
  const events = new Map(catalog.map((event) => [event.id, event]));
  const awcEvents = catalog.filter((event) => event.series_key === "awc").sort((left, right) => left.start_date.localeCompare(right.start_date));
  const awards = [];
  const participants = /* @__PURE__ */ new Map();
  for (const event of catalog) {
    if (!["awc", "ccac", "ahc", "aoc"].includes(event.series_key)) continue;
    const eventMatches = matches.filter((match) => match.tournament === event.id);
    eventMatches.forEach((match) => {
      addParticipant(participants, event.id, match.p1);
      addParticipant(participants, event.id, match.p2);
    });
    awards.push(...await knockoutAwards(event, eventMatches, awcEvents));
  }
  for (const season of atomicChessLeagueSeasons) {
    const tournamentId = `acl-s${season.number}`;
    for (const division of season.divisions) {
      for (const round of division.rounds) {
        for (const matchup of round.matchups) {
          for (const board of matchup.boards) {
            addParticipant(
              participants,
              tournamentId,
              getAtomicChessLeaguePlayerName(board.player1)
            );
            addParticipant(
              participants,
              tournamentId,
              getAtomicChessLeaguePlayerName(board.player2)
            );
          }
        }
      }
    }
  }
  awards.push(...await aclAwards(events));
  const wolfarena = events.get("wr-arena2026");
  const wolfarenaArchive = archives.find((archive) => archive.tournament_id === "wr-arena2026");
  if (wolfarena && wolfarenaArchive) {
    const rounds = Array.isArray(wolfarenaArchive.payload.rounds) ? wolfarenaArchive.payload.rounds : [];
    const lastRound = rounds.at(-1);
    const standings = Array.isArray(lastRound?.standings) ? lastRound.standings : [];
    standings.forEach(
      (raw) => addParticipant(participants, wolfarena.id, raw.player)
    );
    awards.push(...wolfarenaAwards(wolfarena, wolfarenaArchive.payload));
  }
  const { data: existingAwards, error: existingAwardsError } = await supabase.from("atomic_tour_point_awards").select("award_key");
  if (existingAwardsError) throw existingAwardsError;
  const existingAwardKeys = existingAwards.map(
    ({ award_key }) => award_key
  );
  for (let offset = 0; offset < existingAwardKeys.length; offset += 200) {
    const { error } = await supabase.from("atomic_tour_point_awards").delete().in("award_key", existingAwardKeys.slice(offset, offset + 200));
    if (error) throw error;
  }
  for (let offset = 0; offset < awards.length; offset += 500) {
    const { error } = await supabase.from("atomic_tour_point_awards").insert(awards.slice(offset, offset + 500));
    if (error) throw error;
  }
  while (true) {
    const { data: existingSnapshots, error: existingSnapshotsError } = await supabase.from("atomic_tour_ranking_snapshots").select("snapshot_date").limit(1e3);
    if (existingSnapshotsError) throw existingSnapshotsError;
    const existingSnapshotDates = [
      ...new Set(
        existingSnapshots.map(
          ({ snapshot_date }) => snapshot_date
        )
      )
    ];
    if (!existingSnapshotDates.length) break;
    const { error } = await supabase.from("atomic_tour_ranking_snapshots").delete().in("snapshot_date", existingSnapshotDates);
    if (error) throw error;
  }
  const materialDateByMonth = /* @__PURE__ */ new Map();
  for (const award of awards) {
    for (const changeDate of [award.awarded_on, award.expires_on]) {
      if (changeDate > today) continue;
      const month = changeDate.slice(0, 7);
      const existingDate = materialDateByMonth.get(month);
      if (!existingDate || changeDate > existingDate) materialDateByMonth.set(month, changeDate);
    }
  }
  const snapshotDates = new Set(materialDateByMonth.values());
  snapshotDates.add(today);
  for (const snapshotDate of [...snapshotDates].sort()) {
    const { error } = await supabase.rpc("refresh_atomic_tour_ranking", {
      p_snapshot_date: snapshotDate
    });
    if (error) throw error;
  }
  const { error: entriesError } = await supabase.rpc("refresh_atomic_tour_event_entries");
  if (entriesError) throw entriesError;
  const entryRows = [...participants].flatMap(([tournamentId, eventParticipants]) => {
    const event = events.get(tournamentId);
    if (!event) return [];
    const startPoints = /* @__PURE__ */ new Map();
    for (const award of awards) {
      if (award.awarded_on >= event.start_date || award.expires_on < event.start_date) continue;
      startPoints.set(award.player_name, (startPoints.get(award.player_name) ?? 0) + award.points);
    }
    const startRanks = /* @__PURE__ */ new Map();
    [...startPoints.entries()].filter(([, points]) => points > 0).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).forEach(([player, points], index, ranked) => {
      const rank = index > 0 && ranked[index - 1]?.[1] === points ? startRanks.get(ranked[index - 1][0]) : index + 1;
      startRanks.set(player, rank);
    });
    return [...eventParticipants].map((playerName) => ({
      tournament_id: tournamentId,
      player_name: playerName,
      start_rank: startRanks.get(playerName) ?? null,
      start_points: startPoints.get(playerName) ?? 0,
      points_earned: awards.filter((award) => award.tournament_id === tournamentId && award.player_name === playerName).reduce((total, award) => total + award.points, 0)
    }));
  });
  for (let offset = 0; offset < entryRows.length; offset += 500) {
    const { error } = await supabase.from("atomic_tour_event_entries").upsert(entryRows.slice(offset, offset + 500), {
      onConflict: "tournament_id,player_name"
    });
    if (error) throw error;
  }
  process.stdout.write(
    `Published ${awards.length} Atomic Tour point awards and ${snapshotDates.size} material snapshots.
`
  );
};
await run();
