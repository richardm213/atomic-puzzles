import { createHash } from "node:crypto";

export const OPENING_EXPLORER_RESPONSE_SCHEMA = "packed-month-v1";
export const PACKED_INDEX_SCHEMA = "lichess-packed-month-v1";
export const PACKED_INDEX_SCHEMA_WITH_TOTALS = "lichess-packed-v2";
export const PACKED_INDEX_SCHEMA_WITH_FILTERS = "lichess-packed-v3";

export const sqlString = (value) => `'${value.replaceAll("'", "''")}'`;

const positionKeyFen = (fen) => fen.trim().split(/\s+/).slice(0, 4).join(" ");

export const positionKeyHex = (fen) =>
  createHash("sha1")
    .update(`atomic|${positionKeyFen(fen)}`)
    .digest("hex")
    .slice(0, 24);

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

const monthKeyFromDateKey = (value) => (Number.isInteger(value) ? Math.floor(value / 100) : null);

const openingNameIdSql = (username) => {
  const name = sqlString(username);
  const aliasPath = sqlString(`$."${username}"`);
  return `coalesce(
    (select name_id from opening_names where name = ${name} limit 1),
    (select name_id from opening_names where lower(name) = ${name} limit 1),
    (select n.name_id
      from opening_index_meta m
      join opening_names n on lower(n.name) = lower(json_extract(m.value, ${aliasPath}))
      where m.key = 'aliases' limit 1)
  )`;
};

export const buildOpeningPlayersSql = () => `
  select n.name as username
  from opening_players p
  join opening_names n on n.name_id = p.player_id
  order by lower(n.name), n.name;
`;

export const buildRandomOpeningPlayerSql = () => `
  select n.name as username
  from opening_players p
  join opening_names n on n.name_id = p.player_id
  order by random()
  limit 1;
`;

export const buildPackedPayloadSql = ({
  color,
  endDate,
  keyHex,
  opponent,
  speeds,
  startDate,
  username,
  useTotals,
}) => {
  const speedSql = speeds.join(",");
  const startMonth = monthKeyFromDateKey(startDate);
  const endMonth = monthKeyFromDateKey(endDate);
  const monthSql = `
    ${startMonth ? `and played_month >= ${startMonth}` : ""}
    ${endMonth ? `and played_month <= ${endMonth}` : ""}
  `;

  if (!username && useTotals && !startMonth && !endMonth) {
    return `select payload from general_total
      where position_key = X'${keyHex}' and speed in (${speedSql})
      union all
      select m.payload from general_month m
      where m.position_key = X'${keyHex}' and m.speed in (${speedSql})
        and not exists (
          select 1 from general_total t
          where t.position_key = m.position_key and t.speed = m.speed
        );`;
  }

  if (!username) {
    return `select payload from general_month
      where position_key = X'${keyHex}' and speed in (${speedSql})
      ${monthSql}
      order by played_month, speed;`;
  }

  const playerId = openingNameIdSql(username);
  const opponentId = opponent ? openingNameIdSql(opponent) : null;
  if (opponentId) {
    return `select payload from player_opponent_month
      where player_id = ${playerId}
        and opponent_id = ${opponentId}
        and player_color = ${color}
        and position_key = X'${keyHex}' and speed in (${speedSql})
        ${monthSql}
      order by played_month, speed;`;
  }

  if (useTotals && !startMonth && !endMonth) {
    return `select payload from player_total
      where player_id = ${playerId}
        and player_color = ${color}
        and position_key = X'${keyHex}' and speed in (${speedSql})
      union all
      select m.payload from player_month m
      where m.player_id = ${playerId}
        and m.player_color = ${color}
        and m.position_key = X'${keyHex}' and m.speed in (${speedSql})
        and not exists (
          select 1 from player_total t
          where t.player_id = m.player_id and t.player_color = m.player_color
            and t.speed = m.speed and t.position_key = m.position_key
        );`;
  }

  return `select payload from player_month
    where player_id = ${playerId}
      and player_color = ${color}
      and position_key = X'${keyHex}' and speed in (${speedSql})
      ${monthSql}
    order by played_month, speed;`;
};

export const buildOpeningGamesSql = (gameKeys) => {
  const keys = [...new Set(gameKeys)]
    .filter((key) => Number.isSafeInteger(key) && key >= 0)
    .slice(0, 512);
  if (!keys.length) return null;
  return `select g.game_key as gameKey, g.game_id as gameId,
      g.played_on as playedOn, g.white_rating as whiteRating,
      g.black_rating as blackRating, g.winner,
      w.name as white, b.name as black
    from opening_games g
    left join opening_names w on w.name_id = g.white_id
    left join opening_names b on b.name_id = g.black_id
    where g.game_key in (${keys.join(",")});`;
};
