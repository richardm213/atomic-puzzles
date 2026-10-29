import { getArchiveClient } from "./client";

type JsonRow = Record<string, unknown>;

const MODE_IDS = {
  hyperbullet: 0,
  bullet: 1,
  blitz: 2,
  wolfrandom: 3,
  atomic960: 4,
} as const;
const SOURCE_IDS = {
  lobby: 0,
  arena: 1,
  friend: 2,
  swiss: 3,
  chesscom: 4,
  pychess: 5,
} as const;
const modeNameSql = (column: string): string =>
  `case ${column} when 0 then 'hyperbullet' when 1 then 'bullet' when 2 then 'blitz' when 3 then 'wolfrandom' when 4 then 'atomic960' else 'unknown' end`;
const MAX_PAGE_SIZE = 200;
const MAX_PAGE_NUMBER = 100_000;
const MAX_ROW_LIMIT = 10_000;
const DEFAULT_SEARCH_LIMIT = 36;
const USERNAME_SEARCH_PATTERN = /^[a-z0-9_-]+$/;

const RESOURCE_PARAMETERS: Record<string, ReadonlySet<string>> = {
  matches: new Set([
    "resource",
    "mode",
    "username",
    "pairA",
    "pairB",
    "matchId",
    "startTs",
    "endTs",
    "timeControl",
    "timeControlInitial",
    "timeControlIncrement",
    "sources",
    "ratingMin",
    "ratingMax",
    "ratingFilterType",
    "page",
    "pageSize",
    "includeTotal",
  ]),
  player_game_counts: new Set(["resource", "username"]),
  latest_match: new Set(["resource"]),
  aliases: new Set(["resource", "username", "query", "limit"]),
  weekly_ratings: new Set(["resource", "username", "mode"]),
  ratings: new Set(["resource", "username", "mode", "limit"]),
  player_directory: new Set(["resource", "limit"]),
  leaderboard: new Set(["resource", "month", "mode", "username", "limit"]),
  yearly_leaderboard: new Set(["resource", "year", "mode", "limit"]),
  leaderboard_counts: new Set(["resource"]),
  usernames: new Set(["resource", "query", "exact"]),
  health: new Set(["resource"]),
};

export class ArchiveRequestError extends Error {}

const enumIdParam = <T extends Record<string, number>>(
  params: URLSearchParams,
  key: string,
  values: T,
): T[keyof T] | null => {
  const value = String(params.get(key) ?? "")
    .trim()
    .toLowerCase();
  if (!value) return null;
  const id = values[value];
  if (id === undefined) throw new ArchiveRequestError(`Unsupported ${key}`);
  return id as T[keyof T];
};

const numberParam = (params: URLSearchParams, key: string): number | null => {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new ArchiveRequestError(`${key} must be a finite number`);
  return value;
};

const boundedStringParam = (
  params: URLSearchParams,
  key: string,
  maximumLength: number,
): string => {
  const value = String(params.get(key) ?? "").trim();
  if (value.length > maximumLength) {
    throw new ArchiveRequestError(`${key} must be at most ${maximumLength} characters`);
  }
  return value;
};

const positiveIntegerParam = (
  params: URLSearchParams,
  key: string,
  fallback: number,
  maximum?: number,
): number => {
  const value = numberParam(params, key) ?? fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ArchiveRequestError(`${key} must be a positive integer`);
  }
  return maximum === undefined ? value : Math.min(value, maximum);
};

const optionalPositiveIntegerParam = (
  params: URLSearchParams,
  key: string,
  maximum: number,
): number => {
  if (!params.has(key)) return 0;
  if (!params.get(key)?.trim()) throw new ArchiveRequestError(`${key} must be a positive integer`);
  return positiveIntegerParam(params, key, 1, maximum);
};

const strictBooleanParam = (params: URLSearchParams, key: string, fallback: boolean): boolean => {
  const raw = params.get(key);
  if (raw === null) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new ArchiveRequestError(`${key} must be true or false`);
};

const escapeLikePattern = (value: string): string => value.replace(/[\\%_]/g, "\\$&");

const validateResourceParameters = (params: URLSearchParams, resource: string): void => {
  const allowed = RESOURCE_PARAMETERS[resource];
  if (!allowed) throw new ArchiveRequestError("Unknown archive resource");
  for (const key of params.keys()) {
    if (!allowed.has(key)) throw new ArchiveRequestError(`Unexpected query parameter: ${key}`);
  }
};

const normalizedRows = (rows: Iterable<Record<string, unknown>>): JsonRow[] =>
  Array.from(rows, (row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "bigint" ? Number(value) : value,
      ]),
    ),
  );

const queryMatches = async (params: URLSearchParams) => {
  const mode = enumIdParam(params, "mode", MODE_IDS);
  const clauses: string[] = [];
  const args: Array<string | number> = [];
  const page = positiveIntegerParam(params, "page", 1);
  if (page > MAX_PAGE_NUMBER) {
    throw new ArchiveRequestError(`page must be at most ${MAX_PAGE_NUMBER}`);
  }
  const pageSize = positiveIntegerParam(params, "pageSize", 100, MAX_PAGE_SIZE);
  const includeTotal = strictBooleanParam(params, "includeTotal", true);
  const emptyPage = {
    rows: [],
    total: 0,
    page,
    pageSize,
    totalPages: 0,
    hasPreviousPage: page > 1,
    hasNextPage: false,
  };
  if (mode !== null) {
    clauses.push("m.mode = ?");
    args.push(mode);
  }
  const archive = getArchiveClient();
  const resolvePlayerId = async (username: string): Promise<number | null> => {
    const result = await archive.execute({
      sql: "select id from players where username=? limit 1",
      args: [username],
    });
    const value = Number(result.rows[0]?.id);
    return Number.isSafeInteger(value) ? value : null;
  };
  const username = boundedStringParam(params, "username", 100).toLowerCase();
  const pairA = boundedStringParam(params, "pairA", 100).toLowerCase();
  const pairB = boundedStringParam(params, "pairB", 100).toLowerCase();
  const matchId = boundedStringParam(params, "matchId", 128);
  if (Boolean(pairA) !== Boolean(pairB)) {
    throw new ArchiveRequestError("pairA and pairB must be supplied together");
  }
  let usernamePlayerId: number | null = null;
  if (username) {
    usernamePlayerId = await resolvePlayerId(username);
    if (usernamePlayerId === null) return emptyPage;
  }
  if (pairA && pairB) {
    const [playerAId, playerBId] = await Promise.all([
      resolvePlayerId(pairA),
      resolvePlayerId(pairB),
    ]);
    if (playerAId === null || playerBId === null) return emptyPage;
    clauses.push(
      "((m.player_1_id = ? and m.player_2_id = ?) or (m.player_1_id = ? and m.player_2_id = ?))",
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
  const timeControlPart = (key: "timeControlInitial" | "timeControlIncrement"): string => {
    const value = boundedStringParam(params, key, 20);
    if (value && !/^\d+(?:\.\d*)?$/.test(value)) {
      throw new ArchiveRequestError(`${key} must be a non-negative number`);
    }
    return value ? String(Number(value)) : "";
  };
  const timeControlInitial = timeControlPart("timeControlInitial");
  const timeControlIncrement = timeControlPart("timeControlIncrement");
  if (timeControlInitial) {
    clauses.push("substr(tc.value, 1, instr(tc.value, '+') - 1) = ?");
    args.push(timeControlInitial);
  }
  if (timeControlIncrement) {
    clauses.push("substr(tc.value, instr(tc.value, '+') + 1) = ?");
    args.push(timeControlIncrement);
  }
  const sourcesSpecified = params.has("sources");
  const sourceValues = boundedStringParam(params, "sources", 100)
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (sourcesSpecified && sourceValues.length === 0) {
    clauses.push("0 = 1");
  } else if (sourceValues.length) {
    const includeUnknown = sourceValues.includes("unknown");
    const sourceIds = sourceValues.flatMap((source) => {
      if (source === "unknown") return [];
      if (!(source in SOURCE_IDS)) throw new ArchiveRequestError("Unsupported source");
      return [SOURCE_IDS[source as keyof typeof SOURCE_IDS]];
    });
    const sourceClauses = [
      ...(sourceIds.length ? [`m.source in (${sourceIds.map(() => "?").join(",")})`] : []),
      ...(includeUnknown ? ["m.source not in (0,1,2,3,4,5)"] : []),
    ];
    clauses.push(`(${sourceClauses.join(" or ")})`);
    args.push(...sourceIds);
  }
  const ratingMin = numberParam(params, "ratingMin");
  const ratingMax = numberParam(params, "ratingMax");
  if ((ratingMin === null) !== (ratingMax === null)) {
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
      case m.source when 0 then 'lobby' when 1 then 'arena' when 2 then 'friend' when 3 then 'swiss' when 4 then 'chesscom' when 5 then 'pychess' else 'unknown' end source,
      m.tournament_id,m.games,m.p1_before_rating/10.0 p1_before_rating,m.p1_after_rating/10.0 p1_after_rating,
      m.p1_before_rd/10.0 p1_before_rd,m.p1_after_rd/10.0 p1_after_rd,m.p2_before_rating/10.0 p2_before_rating,
      m.p2_after_rating/10.0 p2_after_rating,m.p2_before_rd/10.0 p2_before_rd,m.p2_after_rd/10.0 p2_after_rd
      from matches m join players p1 on p1.id=m.player_1_id join players p2 on p2.id=m.player_2_id
      join time_controls tc on tc.id=m.time_control_id`;
  let result;
  let total: number | null = null;
  const queryLimit = includeTotal ? pageSize : pageSize + 1;
  if (usernamePlayerId !== null) {
    const playerOneWhere = `${where} and m.player_1_id = ?`;
    // The extra player_1 predicate preserves OR semantics for the unlikely self-match case.
    const playerTwoWhere = `${where} and m.player_2_id = ? and m.player_1_id <> ?`;
    const playerOneArgs = [...args, usernamePlayerId];
    const playerTwoArgs = [...args, usernamePlayerId, usernamePlayerId];
    if (includeTotal) {
      const countResult = await archive.execute({
        sql: `select sum(total) as total from (
          select count(*) as total from matches m join time_controls tc on tc.id=m.time_control_id where ${playerOneWhere}
          union all
          select count(*) as total from matches m join time_controls tc on tc.id=m.time_control_id where ${playerTwoWhere})`,
        args: [...playerOneArgs, ...playerTwoArgs],
      });
      total = Number(countResult.rows[0]?.total ?? 0);
    }
    result = await archive.execute({
      sql: `select * from (
        ${selectMatch} where ${playerOneWhere}
        union all
        ${selectMatch} where ${playerTwoWhere}
      ) order by start_ts desc limit ? offset ?`,
      args: [...playerOneArgs, ...playerTwoArgs, queryLimit, (page - 1) * pageSize],
    });
  } else {
    if (includeTotal) {
      const countResult = await archive.execute({
        sql: `select count(*) as total from matches m join time_controls tc on tc.id=m.time_control_id where ${where}`,
        args,
      });
      total = Number(countResult.rows[0]?.total ?? 0);
    }
    result = await archive.execute({
      sql: `${selectMatch} where ${where} order by m.start_ts desc limit ? offset ?`,
      args: [...args, queryLimit, (page - 1) * pageSize],
    });
  }
  const rawRows = normalizedRows(result.rows);
  const hasNextPage = includeTotal ? page * pageSize < (total ?? 0) : rawRows.length > pageSize;
  const rows = rawRows.slice(0, pageSize).map((row) => ({
    ...row,
    games: String(row.games ?? "")
      .split("|")
      .filter(Boolean),
  }));
  const resolvedTotal = total ?? (page - 1) * pageSize + rows.length + (hasNextPage ? 1 : 0);
  const totalPages = includeTotal
    ? Math.ceil(resolvedTotal / pageSize)
    : page + (hasNextPage ? 1 : 0);
  return {
    rows,
    total: resolvedTotal,
    page,
    pageSize,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage,
  };
};

const queryAliases = async (params: URLSearchParams) => {
  const requested = boundedStringParam(params, "username", 100);
  const search = boundedStringParam(params, "query", 100).toLowerCase();
  if (search && !USERNAME_SEARCH_PATTERN.test(search)) {
    throw new ArchiveRequestError("query contains unsupported username characters");
  }
  if (requested && search) {
    throw new ArchiveRequestError("username and query cannot be supplied together");
  }
  const archive = getArchiveClient();
  const limit =
    optionalPositiveIntegerParam(params, "limit", MAX_ROW_LIMIT) ||
    (search ? DEFAULT_SEARCH_LIMIT : MAX_ROW_LIMIT);
  let canonical = requested.toLowerCase();
  if (requested) {
    const resolved = await archive.execute({
      sql: `select p.username from aliases a join players p on p.id=a.player_id
        where a.alias=? or (a.count_games<>'p' and lower(a.alias)=?)
        order by case when a.alias=? then 0 else 1 end limit 1`,
      args: [requested, requested.toLowerCase(), requested],
    });
    canonical = String(resolved.rows[0]?.username ?? canonical);
  }
  const botColumn = await archive.execute(
    "select 1 as present from pragma_table_info('aliases') where name='bot' limit 1",
  );
  const botSelection = botColumn.rows.length > 0 ? "a.bot" : "0 as bot";
  const searchPattern = `%${escapeLikePattern(search)}%`;
  const result = await archive.execute(
    search
      ? {
          sql: `select a.alias,p.username,a.banned,${botSelection},a.count_games,a.openings from aliases a
            join players p on p.id=a.player_id
            where p.id in (
              select distinct a2.player_id from aliases a2 join players p2 on p2.id=a2.player_id
              where p2.username like ? escape '\\' or a2.alias like ? escape '\\'
              order by case when p2.username=? then 0 when p2.username like ? escape '\\' then 1 else 2 end,
                length(p2.username),p2.username limit ?
            ) order by p.username,a.alias`,
          args: [searchPattern, searchPattern, search, `${escapeLikePattern(search)}%`, limit],
        }
      : {
          sql: `select a.alias,p.username,a.banned,${botSelection},a.count_games,a.openings from aliases a
            join players p on p.id=a.player_id ${canonical ? "where p.username=?" : ""}
            order by p.username,a.alias limit ?`,
          args: canonical ? [canonical, limit] : [limit],
        },
  );
  return normalizedRows(result.rows).map((row) => ({
    ...row,
    banned: Boolean(row.banned),
    bot: Boolean(row.bot),
  }));
};

const queryRatings = async (params: URLSearchParams) => {
  const clauses: string[] = [];
  const args: Array<string | number> = [];
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
  const limit = optionalPositiveIntegerParam(params, "limit", MAX_ROW_LIMIT) || MAX_ROW_LIMIT;
  const result = await getArchiveClient().execute({
    sql: `select p.username,r.rating/10.0 rating,r.peak/10.0 peak,r.peak_date,r.rd/10.0 rd,r.games,
      ${modeNameSql("r.mode")} tc,
      r.rank,r.top20_wins from player_ratings r join players p on p.id=r.username_id
      ${clauses.length ? `where ${clauses.join(" and ")}` : ""} order by r.rank limit ?`,
    args: [...args, limit],
  });
  return normalizedRows(result.rows);
};

const queryPlayerDirectory = async (params: URLSearchParams) => {
  const limit = optionalPositiveIntegerParam(params, "limit", MAX_ROW_LIMIT) || MAX_ROW_LIMIT;
  const result = await getArchiveClient().execute({
    sql: `select p.username,
      max(case when r.mode=0 then r.rating/10.0 end) hyperbullet_rating,
      max(case when r.mode=0 then r.peak/10.0 end) hyperbullet_peak,
      max(case when r.mode=0 then r.rd/10.0 end) hyperbullet_rd,
      max(case when r.mode=1 then r.rating/10.0 end) bullet_rating,
      max(case when r.mode=1 then r.peak/10.0 end) bullet_peak,
      max(case when r.mode=1 then r.rd/10.0 end) bullet_rd,
      max(case when r.mode=2 then r.rating/10.0 end) blitz_rating,
      max(case when r.mode=2 then r.peak/10.0 end) blitz_peak,
      max(case when r.mode=2 then r.rd/10.0 end) blitz_rd,
      max(case when r.mode=4 then r.rating/10.0 end) atomic960_rating,
      max(case when r.mode=4 then r.peak/10.0 end) atomic960_peak,
      max(case when r.mode=4 then r.rd/10.0 end) atomic960_rd
      from player_ratings r join players p on p.id=r.username_id
      where r.mode in (0,1,2,4)
      group by p.id,p.username order by p.username limit ?`,
    args: [limit],
  });
  return normalizedRows(result.rows);
};

// Weekly aggregates are maintained by the matches pipeline, not recomputed here.
// Include the incomplete week and retain missing weeks as missing observations.
const queryWeeklyRatings = async (params: URLSearchParams) => {
  const username = boundedStringParam(params, "username", 100).toLowerCase();
  if (!username) throw new ArchiveRequestError("Weekly ratings require a username");
  const mode = enumIdParam(params, "mode", MODE_IDS);
  const result = await getArchiveClient().execute({
    sql: `select p.username,r.week,r.rating/10.0 rating,r.rd/10.0 rd,r.games,
      ${modeNameSql("r.mode")} tc from weekly_ratings r
      join players p on p.id=r.username_id
      where p.username=?${mode !== null ? " and r.mode=?" : ""} order by r.week,r.mode`,
    args: mode !== null ? [username, mode] : [username],
  });
  return normalizedRows(result.rows);
};

const queryLeaderboard = async (params: URLSearchParams) => {
  const clauses: string[] = ["l.rank>0"];
  const args: Array<string | number> = [];
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
  const limit = optionalPositiveIntegerParam(params, "limit", MAX_ROW_LIMIT) || MAX_ROW_LIMIT;
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const result = await getArchiveClient().execute({
    sql: `select p.username,l.month,l.rank,l.rating/10.0 rating,l.rd/10.0 rd,l.games,
      ${modeNameSql("l.mode")} tc
      from lb l join players p on p.id=l.username_id ${where} order by l.month,l.mode,l.rank limit ?`,
    args: [...args, limit],
  });
  return normalizedRows(result.rows);
};

const queryLeaderboardCounts = async () => {
  const result = await getArchiveClient().execute(`select month month_value,
    ${modeNameSql("mode")} mode,
    count(*) player_count from lb where rank>0 group by month,mode`);
  return normalizedRows(result.rows);
};

const queryYearlyLeaderboard = async (params: URLSearchParams) => {
  const clauses: string[] = ["l.rank>0"];
  const args: Array<string | number> = [];
  const yearValue = numberParam(params, "year");
  if (
    yearValue !== null &&
    (!Number.isSafeInteger(yearValue) || yearValue < 2000 || yearValue > 3000)
  ) {
    throw new ArchiveRequestError("year must be an integer from 2000 through 3000");
  }
  const year = yearValue ?? 0;
  if (!year) throw new ArchiveRequestError("yearly leaderboard requires a year");
  clauses.push("l.year=?");
  args.push(year);
  const mode = enumIdParam(params, "mode", MODE_IDS);
  if (mode !== null) {
    if (mode > MODE_IDS.blitz) throw new ArchiveRequestError("Unsupported yearly leaderboard mode");
    clauses.push("l.mode=?");
    args.push(mode);
  }
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const limit = optionalPositiveIntegerParam(params, "limit", MAX_ROW_LIMIT) || MAX_ROW_LIMIT;
  const result = await getArchiveClient().execute({
    sql: `select p.username,l.year,l.rank,l.rating/10.0 rating,l.games,
      ${modeNameSql("l.mode")} tc from yearly_lb l join players p on p.id=l.username_id
      ${where} order by l.year,l.mode,l.rank limit ?`,
    args: [...args, limit],
  });
  return normalizedRows(result.rows);
};

const queryUsernames = async (params: URLSearchParams) => {
  const query = boundedStringParam(params, "query", 100).toLowerCase();
  const exact = boundedStringParam(params, "exact", 100).toLowerCase();
  if (
    (query && !USERNAME_SEARCH_PATTERN.test(query)) ||
    (exact && !USERNAME_SEARCH_PATTERN.test(exact))
  ) {
    throw new ArchiveRequestError("username search contains unsupported characters");
  }
  if (exact) {
    const result = await getArchiveClient().execute({
      sql: "select username from players where username=? limit 1",
      args: [exact],
    });
    return normalizedRows(result.rows);
  }
  if (query.length < 3) return [];
  const escapedQuery = escapeLikePattern(query);
  const result = await getArchiveClient().execute({
    sql: `select username from players where username like ? escape '\\'
      order by case when username=? then 0 when username like ? escape '\\' then 1 else 2 end,
      length(username),username limit 36`,
    args: [`%${escapedQuery}%`, query, `${escapedQuery}%`],
  });
  return normalizedRows(result.rows);
};

export type AchievementRatingPeak = {
  mode: "hyperbullet" | "bullet" | "blitz";
  rating: number;
};

export const queryAchievementRatingPeaks = async (
  username: string,
): Promise<AchievementRatingPeak[]> => {
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername) return [];
  const result = await getArchiveClient().execute({
    sql: `select ${modeNameSql("qualified.mode")} mode,max(qualified.rating) / 10.0 rating
      from (
        select m.mode,m.p1_before_rating rating from matches m
        where m.player_1_id=(select id from players where username=? limit 1)
          and m.mode in (0,1,2) and m.p1_before_rd < 600
        union all
        select m.mode,m.p1_after_rating rating from matches m
        where m.player_1_id=(select id from players where username=? limit 1)
          and m.mode in (0,1,2) and m.p1_after_rd < 600
        union all
        select m.mode,m.p2_before_rating rating from matches m
        where m.player_2_id=(select id from players where username=? limit 1)
          and m.mode in (0,1,2) and m.p2_before_rd < 600
        union all
        select m.mode,m.p2_after_rating rating from matches m
        where m.player_2_id=(select id from players where username=? limit 1)
          and m.mode in (0,1,2) and m.p2_after_rd < 600
      ) qualified
      group by qualified.mode`,
    args: [normalizedUsername, normalizedUsername, normalizedUsername, normalizedUsername],
  });
  return normalizedRows(result.rows).flatMap((row) => {
    const mode = String(row.mode);
    const rating = Number(row.rating);
    if (
      (mode !== "hyperbullet" && mode !== "bullet" && mode !== "blitz") ||
      !Number.isFinite(rating)
    ) {
      return [];
    }
    return [{ mode, rating }];
  });
};

export const queryArchiveResource = async (params: URLSearchParams): Promise<unknown> => {
  const resource = boundedStringParam(params, "resource", 50);
  validateResourceParameters(params, resource);
  if (resource === "matches") return queryMatches(params);
  if (resource === "player_game_counts") {
    const username = boundedStringParam(params, "username", 100).toLowerCase();
    if (!username) throw new ArchiveRequestError("Username is required");
    const result = await getArchiveClient().execute({
      sql: `select ${modeNameSql("m.mode")} mode,
        sum(case when trim(coalesce(m.games, ''), '|') = '' then 0
          else length(trim(m.games, '|')) - length(replace(trim(m.games, '|'), '|', '')) + 1 end) games
        from matches m
        where (m.player_1_id = (select id from players where username = ?)
          or m.player_2_id = (select id from players where username = ?))
          and m.mode in (0, 1, 2, 4)
        group by m.mode`,
      args: [username, username],
    });
    return normalizedRows(result.rows);
  }

  if (resource === "latest_match") {
    const result = await getArchiveClient().execute(
      "select max(start_ts) as start_ts from matches",
    );
    const timestamp = result.rows[0]?.start_ts;
    return { start_ts: timestamp === null || timestamp === undefined ? null : Number(timestamp) };
  }
  if (resource === "aliases") return queryAliases(params);
  if (resource === "weekly_ratings") return queryWeeklyRatings(params);
  if (resource === "ratings") return queryRatings(params);
  if (resource === "player_directory") return queryPlayerDirectory(params);
  if (resource === "leaderboard") return queryLeaderboard(params);
  if (resource === "yearly_leaderboard") return queryYearlyLeaderboard(params);
  if (resource === "leaderboard_counts") return queryLeaderboardCounts();
  if (resource === "usernames") return queryUsernames(params);
  if (resource === "health") {
    const result = await getArchiveClient().execute(
      "select value from metadata where key='schema_version'",
    );
    return { ok: true, schemaVersion: String(result.rows[0]?.value ?? "") };
  }
  throw new ArchiveRequestError("Unknown archive resource");
};
