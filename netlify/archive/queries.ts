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
  unknown: 5,
} as const;
const modeNameSql = (column: string): string =>
  `case ${column} when 0 then 'hyperbullet' when 1 then 'bullet' when 2 then 'blitz' when 3 then 'wolfrandom' when 4 then 'atomic960' else 'unknown' end`;
const MAX_PAGE_SIZE = 200;

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
  return Number.isFinite(value) ? value : null;
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
  if (mode === null) throw new ArchiveRequestError("Match mode is required");
  const clauses = ["m.mode = ?"];
  const args: Array<string | number> = [mode];
  const archive = getArchiveClient();
  const resolvePlayerId = async (username: string): Promise<number | null> => {
    const result = await archive.execute({
      sql: "select id from players where username=? limit 1",
      args: [username],
    });
    const value = Number(result.rows[0]?.id);
    return Number.isSafeInteger(value) ? value : null;
  };
  const username = String(params.get("username") ?? "")
    .trim()
    .toLowerCase();
  const pairA = String(params.get("pairA") ?? "")
    .trim()
    .toLowerCase();
  const pairB = String(params.get("pairB") ?? "")
    .trim()
    .toLowerCase();
  const matchId = String(params.get("matchId") ?? "").trim();
  if (username) {
    const playerId = await resolvePlayerId(username);
    if (playerId === null) return { rows: [], total: 0 };
    clauses.push("(m.player_1_id = ? or m.player_2_id = ?)");
    args.push(playerId, playerId);
  }
  if (pairA && pairB) {
    const [playerAId, playerBId] = await Promise.all([
      resolvePlayerId(pairA),
      resolvePlayerId(pairB),
    ]);
    if (playerAId === null || playerBId === null) return { rows: [], total: 0 };
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
  if (startTs !== null) {
    clauses.push("m.start_ts >= ?");
    args.push(startTs);
  }
  if (endTs !== null) {
    clauses.push("m.start_ts <= ?");
    args.push(endTs);
  }
  const timeControl = String(params.get("timeControl") ?? "").trim();
  if (timeControl && timeControl.toLowerCase() !== "all") {
    clauses.push("tc.value = ?");
    args.push(timeControl);
  }
  const sourcesSpecified = params.has("sources");
  const sourceValues = String(params.get("sources") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (sourcesSpecified && sourceValues.length === 0) {
    clauses.push("0 = 1");
  } else if (sourceValues.length) {
    const sourceIds = sourceValues.map((source) => {
      if (!(source in SOURCE_IDS)) throw new ArchiveRequestError("Unsupported source");
      return SOURCE_IDS[source as keyof typeof SOURCE_IDS];
    });
    clauses.push(`m.source in (${sourceValues.map(() => "?").join(",")})`);
    args.push(...sourceIds);
  }
  const ratingMin = numberParam(params, "ratingMin");
  const ratingMax = numberParam(params, "ratingMax");
  if (ratingMin !== null && ratingMax !== null) {
    if (params.get("ratingFilterType") === "average") {
      clauses.push("(m.p1_after_rating + m.p2_after_rating) between ? and ?");
      args.push(ratingMin * 20, ratingMax * 20);
    } else {
      clauses.push("m.p1_after_rating between ? and ? and m.p2_after_rating between ? and ?");
      args.push(ratingMin * 10, ratingMax * 10, ratingMin * 10, ratingMax * 10);
    }
  }
  const page = Math.max(1, Math.floor(numberParam(params, "page") ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(numberParam(params, "pageSize") ?? 100)),
  );
  const where = clauses.join(" and ");
  const countResult = await archive.execute({
    sql: `select count(*) as total from matches m join players p1 on p1.id=m.player_1_id join players p2 on p2.id=m.player_2_id join time_controls tc on tc.id=m.time_control_id where ${where}`,
    args,
  });
  const result = await archive.execute({
    sql: `select m.match_id,p1.username player_1,p2.username player_2,m.start_ts,tc.value time_control,
      case m.source when 0 then 'lobby' when 1 then 'arena' when 2 then 'friend' when 3 then 'swiss' when 4 then 'chesscom' else 'unknown' end source,
      m.tournament_id,m.games,m.p1_before_rating/10.0 p1_before_rating,m.p1_after_rating/10.0 p1_after_rating,
      m.p1_before_rd/10.0 p1_before_rd,m.p1_after_rd/10.0 p1_after_rd,m.p2_before_rating/10.0 p2_before_rating,
      m.p2_after_rating/10.0 p2_after_rating,m.p2_before_rd/10.0 p2_before_rd,m.p2_after_rd/10.0 p2_after_rd
      from matches m join players p1 on p1.id=m.player_1_id join players p2 on p2.id=m.player_2_id
      join time_controls tc on tc.id=m.time_control_id where ${where} order by m.start_ts desc limit ? offset ?`,
    args: [...args, pageSize, (page - 1) * pageSize],
  });
  const rows = normalizedRows(result.rows).map((row) => ({
    ...row,
    games: String(row.games ?? "")
      .split("|")
      .filter(Boolean),
  }));
  return { rows, total: Number(countResult.rows[0]?.total ?? rows.length) };
};

const queryAliases = async (params: URLSearchParams) => {
  const requested = String(params.get("username") ?? "")
    .trim()
    .toLowerCase();
  const archive = getArchiveClient();
  let canonical = requested;
  if (requested) {
    const resolved = await archive.execute({
      sql: "select p.username from aliases a join players p on p.id=a.player_id where a.alias=? limit 1",
      args: [requested],
    });
    canonical = String(resolved.rows[0]?.username ?? requested);
  }
  const result = await archive.execute({
    sql: `select a.alias,p.username,a.banned,a.count_games,a.openings from aliases a
      join players p on p.id=a.player_id ${canonical ? "where p.username=?" : ""} order by p.username,a.alias`,
    args: canonical ? [canonical] : [],
  });
  return normalizedRows(result.rows).map((row) => ({ ...row, banned: Boolean(row.banned) }));
};

const queryRatings = async (params: URLSearchParams) => {
  const clauses: string[] = [];
  const args: Array<string | number> = [];
  const mode = enumIdParam(params, "mode", MODE_IDS);
  if (mode !== null) {
    clauses.push("r.mode=?");
    args.push(mode);
  }
  const username = String(params.get("username") ?? "")
    .trim()
    .toLowerCase();
  if (username) {
    clauses.push("p.username=?");
    args.push(username);
  }
  const limit = Math.max(0, Math.floor(numberParam(params, "limit") ?? 0));
  const result = await getArchiveClient().execute({
    sql: `select p.username,r.rating/10.0 rating,r.peak/10.0 peak,r.peak_date,r.rd/10.0 rd,r.games,
      ${modeNameSql("r.mode")} tc,
      r.rank,r.top20_wins from player_ratings r join players p on p.id=r.username_id
      ${clauses.length ? `where ${clauses.join(" and ")}` : ""} order by r.rank${limit ? " limit ?" : ""}`,
    args: limit ? [...args, limit] : args,
  });
  return normalizedRows(result.rows);
};

const queryLeaderboard = async (params: URLSearchParams) => {
  const clauses: string[] = [];
  const args: Array<string | number> = [];
  const month = String(params.get("month") ?? "").slice(0, 10);
  if (month) {
    clauses.push("l.month=?");
    args.push(month);
  }
  const mode = enumIdParam(params, "mode", MODE_IDS);
  if (mode !== null) {
    clauses.push("l.mode=?");
    args.push(mode);
  }
  const username = String(params.get("username") ?? "")
    .trim()
    .toLowerCase();
  if (username) {
    clauses.push("p.username=?");
    args.push(username);
  }
  const limit = Math.max(0, Math.floor(numberParam(params, "limit") ?? 0));
  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
  const result = await getArchiveClient().execute({
    sql: `select p.username,l.month,l.rank,l.rating/10.0 rating,l.rd/10.0 rd,l.games,
      ${modeNameSql("l.mode")} tc
      from lb l join players p on p.id=l.username_id ${where} order by l.month,l.mode,l.rank${limit ? " limit ?" : ""}`,
    args: limit ? [...args, limit] : args,
  });
  return normalizedRows(result.rows);
};

const queryLeaderboardCounts = async () => {
  const result = await getArchiveClient().execute(`select month month_value,
    ${modeNameSql("mode")} mode,
    count(*) player_count from lb group by month,mode`);
  return normalizedRows(result.rows);
};

const queryUsernames = async (params: URLSearchParams) => {
  const query = String(params.get("query") ?? "")
    .trim()
    .toLowerCase();
  const exact = String(params.get("exact") ?? "")
    .trim()
    .toLowerCase();
  if (exact) {
    const result = await getArchiveClient().execute({
      sql: "select username from players where username=? limit 1",
      args: [exact],
    });
    return normalizedRows(result.rows);
  }
  if (query.length < 3) return [];
  const result = await getArchiveClient().execute({
    sql: `select username from players where username like ?
      order by case when username=? then 0 when username like ? then 1 else 2 end,length(username),username limit 36`,
    args: [`%${query}%`, query, `${query}%`],
  });
  return normalizedRows(result.rows);
};

export const queryArchiveResource = async (params: URLSearchParams): Promise<unknown> => {
  const resource = params.get("resource");
  if (resource === "matches") return queryMatches(params);
  if (resource === "aliases") return queryAliases(params);
  if (resource === "ratings") return queryRatings(params);
  if (resource === "leaderboard") return queryLeaderboard(params);
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
