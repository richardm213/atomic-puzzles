import { createHash } from "node:crypto";

export const OPENING_EXPLORER_RESPONSE_SCHEMA = "compact-position-extras-v3";

export const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;

export const positionKeyHex = (fen) =>
  createHash("sha1").update(`atomic|${fen}`).digest("hex").slice(0, 32);

export const sqlMonthBounds = (value) => {
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

export const buildPositionPlayerLeadersSql = (keyHex, lastMoveColor) => `
  select
    hex(l.position_key) as positionKey,
    l.last_move_color as lastMoveColor,
    l.total_games as totalGames,
    l.leader_rank as leaderRank,
    n.name as username,
    l.player_games as playerGames
  from opening_position_player_leaders l
  join opening_names n
    on n.name_id = l.canonical_player_id
  where l.position_key = X'${keyHex}'
    and l.last_move_color = ${lastMoveColor}
  order by l.leader_rank
  limit 3;
`;

export const buildPositionPlayerLeaderBandsSql = () => `
  select value
  from opening_index_meta
  where key = 'position_player_leader_bands'
  limit 1;
`;

export const lastMoveColorFromFen = (fen) => {
  const activeColor = String(fen ?? "")
    .trim()
    .split(/\s+/)[1];
  if (activeColor === "b") return 0;
  if (activeColor === "w") return 1;
  return null;
};

export const buildPositionTopGamesSql = (keyHex, lastMoveColor) => `
  select
    hex(position_key) as positionKey,
    last_move_color as lastMoveColor,
    game_ids as gameIds,
    rating_floor_game_ids as ratingFloorGameIds
  from opening_position_top_games
  where position_key = X'${keyHex}'
    and last_move_color = ${lastMoveColor}
  limit 1;
`;

export const buildPositionGameDetailsSql = (keyHex, gameIds) => {
  const uniqueGameIds = [...new Set((Array.isArray(gameIds) ? gameIds : []).filter(Boolean))];
  if (!uniqueGameIds.length) return "";

  const gameIdList = uniqueGameIds.map(sqlString).join(",");
  const orderCases = uniqueGameIds
    .map((gameId, index) => `when ${sqlString(gameId)} then ${index}`)
    .join(" ");

  return `
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
    where g.position_key = X'${keyHex}'
      and g.game_id in (${gameIdList})
    group by g.game_id, g.next_uci
    order by case g.game_id ${orderCases} else ${uniqueGameIds.length} end
    limit ${uniqueGameIds.length};
  `;
};

const integerOrNull = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
};

const parseGameIds = (value) =>
  String(value ?? "")
    .split(",")
    .map((gameId) => gameId.trim())
    .filter(Boolean)
    .slice(0, 3);

export const toPositionTopGamesPayload = (rows) => {
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;

  const positionKey = String(row?.positionKey ?? row?.position_key ?? "").trim();
  const lastMoveColor = integerOrNull(row?.lastMoveColor ?? row?.last_move_color);
  const recentGameIds = parseGameIds(row?.gameIds ?? row?.game_ids);
  const topGameIds = parseGameIds(row?.ratingFloorGameIds ?? row?.rating_floor_game_ids);

  if (!positionKey || (lastMoveColor !== 0 && lastMoveColor !== 1)) return null;
  if (!recentGameIds.length && !topGameIds.length) return null;

  return {
    positionKey,
    lastMoveColor,
    recentGameIds,
    topGameIds,
  };
};

const parsePositionPlayerLeaderBands = (rawValue) => {
  if (typeof rawValue !== "string") return [];

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((band) => {
        const minGames = integerOrNull(band?.min_games ?? band?.minGames);
        const maxGames = integerOrNull(band?.max_games ?? band?.maxGames);
        const leaders = integerOrNull(band?.leaders);

        if (
          minGames === null ||
          maxGames === null ||
          leaders === null ||
          minGames < 0 ||
          maxGames < minGames ||
          leaders < 1
        ) {
          return null;
        }

        return { minGames, maxGames, leaders };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

export const toPositionPlayerLeadersPayload = (rows, rawBandsValue) => {
  const normalizedRows = Array.isArray(rows)
    ? rows
        .map((row) => ({
          positionKey: String(row?.positionKey ?? row?.position_key ?? "").trim(),
          lastMoveColor: integerOrNull(row?.lastMoveColor ?? row?.last_move_color),
          totalGames: integerOrNull(row?.totalGames ?? row?.total_games),
          leaderRank: integerOrNull(row?.leaderRank ?? row?.leader_rank),
          username: String(row?.username ?? "").trim(),
          playerGames: integerOrNull(row?.playerGames ?? row?.player_games),
        }))
        .filter(
          (row) =>
            row.positionKey &&
            (row.lastMoveColor === 0 || row.lastMoveColor === 1) &&
            row.totalGames !== null &&
            row.leaderRank !== null &&
            row.username &&
            row.playerGames !== null,
        )
    : [];

  if (!normalizedRows.length) return null;

  const totalGames = normalizedRows[0].totalGames;
  const bands = parsePositionPlayerLeaderBands(rawBandsValue);
  const matchingBand = bands.find(
    (band) => totalGames >= band.minGames && totalGames <= band.maxGames,
  );

  if (!matchingBand) return null;

  const leaders = normalizedRows
    .filter((row) => row.totalGames === totalGames && row.leaderRank <= matchingBand.leaders)
    .sort((a, b) => a.leaderRank - b.leaderRank)
    .map((row) => ({ username: row.username, games: row.playerGames }));

  if (!leaders.length) return null;

  return {
    positionKey: normalizedRows[0].positionKey,
    lastMoveColor: normalizedRows[0].lastMoveColor,
    totalGames,
    leaders,
  };
};

export const buildOpeningExplorerSql = ({
  color,
  endDate,
  keyHex,
  minRating,
  opponent,
  speeds,
  startDate,
  username,
}) => {
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
  const edgesColorSql = color === "all" ? "" : `and player_color = ${color}`;
  const gamesColorSql = color === "all" ? "" : `and g.player_color = ${color}`;
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
    : username
      ? `
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
    `
      : `
      select
        uci,
        count(*) as games,
        sum(case when winner = 1 then 1 else 0 end) as whiteWins,
        sum(case when winner = 0 then 1 else 0 end) as draws,
        sum(case when winner = 2 then 1 else 0 end) as blackWins,
        round(avg(averageRating)) as avgOpponentRating
      from (
        select
          g.game_id,
          g.next_uci as uci,
          g.winner,
          avg((g.white_rating + g.black_rating) / 2.0) as averageRating
        from opening_position_games g
        where ${gamesWhere}
          ${detailsRatingFilter}
        group by g.game_id, g.next_uci, g.winner
      ) deduped_games
      group by uci
      order by games desc
      limit 12;
    `;

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
    ${username ? "" : "group by g.game_id, g.next_uci"}
    order by g.played_at desc
    limit 8;
  `;

  return { gamesSql, movesSql };
};
