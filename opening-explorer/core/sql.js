import { createHash } from "node:crypto";

export const OPENING_EXPLORER_RESPONSE_SCHEMA = "moves-v11";

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

const monthKeyFromDateKey = (value) => (Number.isInteger(value) ? Math.floor(value / 100) : null);

// Every standard atomic game in the explorer passes through the initial position. Restricting
// player discovery to that position lets the database use its position-key index instead of
// scanning the full daily edge table (which grows once for every player, position, and day).
const STANDARD_START_POSITION_KEY_HEX = positionKeyHex(
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
);

const openingPlayerIdsSql = () => `
  select distinct canonical_player_id
  from opening_edges_daily
  where position_key = X'${STANDARD_START_POSITION_KEY_HEX}'
`;

export const buildRandomOpeningPlayerSql = () => `
  select n.name as username
  from opening_names n
  join (
    ${openingPlayerIdsSql()}
  ) players
    on players.canonical_player_id = n.name_id
  order by random()
  limit 1;
`;

export const buildOpeningPlayersSql = () => `
  select n.name as username
  from opening_names n
  join (
    ${openingPlayerIdsSql()}
  ) players
    on players.canonical_player_id = n.name_id
  order by lower(n.name), n.name;
`;

// Coverage is per position/speed, not per request. Check the whole bucket before
// applying dates: a covered bucket with no games in the date range is truly empty.
// CROSS JOIN keeps the tiny coverage table outermost, so covered buckets never
// walk the raw index. Without statistics SQLite otherwise chooses raw rows first.
const buildGeneralBucketQueries = ({ keyHex, speeds, startDate, endDate }) => {
  const coverage = `
    selected_speeds(speed) as (values ${speeds.map((speed) => `(${speed})`).join(",")}),
    coverage as materialized (
      select speed,
        exists(select 1 from opening_position_moves_monthly m
          where m.position_key = X'${keyHex}' and m.speed = s.speed) as savedMoves,
        exists(select 1 from opening_position_recent_games rg
          where rg.position_key = X'${keyHex}' and rg.speed = s.speed) as savedRecent
      from selected_speeds s
    )`;
  const savedRecent = speeds
    .map(
      (speed) => `
    select * from (
      select rg.next_uci as uci, rg.game_id as gameId, rg.played_at as playedAt,
        rg.played_on as playedOn, rg.white_id, rg.black_id,
        rg.white_rating as whiteRating, rg.black_rating as blackRating, rg.winner
      from opening_position_recent_games rg
      where rg.position_key = X'${keyHex}' and rg.speed = ${speed}
        ${startDate ? `and rg.played_on >= ${startDate}` : ""}
        ${endDate ? `and rg.played_on <= ${endDate}` : ""}
      order by rg.played_at desc limit 8
    )`,
    )
    .join(" union all ");
  // Materialize once: statistics and recent games consume the same deduplicated
  // rows. This also prevents repeated metadata joins when games is a SQL view.
  const common = `with ${coverage},
    raw_games as materialized (
      select g.speed, g.game_id as gameId, max(g.next_uci) as uci,
        max(g.played_at) as playedAt, max(g.played_on) as playedOn,
        max(g.white_id) as white_id, max(g.black_id) as black_id,
        max(g.white_rating) as whiteRating, max(g.black_rating) as blackRating,
        max(g.winner) as winner
      from coverage c cross join opening_position_games g
      where (not c.savedMoves or not c.savedRecent)
        and g.speed = c.speed and g.position_key = X'${keyHex}'
        ${startDate ? `and g.played_on >= ${startDate}` : ""}
        ${endDate ? `and g.played_on <= ${endDate}` : ""}
      group by g.speed, g.game_id
    ),
    buckets as (
      select m.next_uci as uci, sum(m.games) as games,
        sum(m.white_wins) as whiteWins, sum(m.draws) as draws,
        sum(m.black_wins) as blackWins, sum(m.rated_games) as ratedGames,
        sum(m.rating_pair_sum) as ratingSum
      from coverage c join opening_position_moves_monthly m
        on m.position_key = X'${keyHex}' and m.speed = c.speed
      where c.savedMoves
        ${startDate ? `and m.played_month >= ${monthKeyFromDateKey(startDate)}` : ""}
        ${endDate ? `and m.played_month <= ${monthKeyFromDateKey(endDate)}` : ""}
      group by m.next_uci
      union all
      select g.uci, count(*), sum(g.winner = 1), sum(g.winner = 0), sum(g.winner = 2),
        sum(g.whiteRating is not null and g.blackRating is not null),
        sum(coalesce(g.whiteRating + g.blackRating, 0))
      from coverage c join raw_games g on g.speed = c.speed
      where not c.savedMoves group by g.uci
    ),
    moves as (
      select uci, sum(games) as games, sum(whiteWins) as whiteWins,
        sum(draws) as draws, sum(blackWins) as blackWins,
        round(sum(ratingSum) * 1.0 / nullif(sum(ratedGames) * 2, 0)) as avgOpponentRating
      from buckets group by uci order by games desc limit 12
    ),
    candidates as (
      ${savedRecent}
      union all
      select * from (
        select g.uci, g.gameId, g.playedAt, g.playedOn, g.white_id, g.black_id,
          g.whiteRating, g.blackRating, g.winner
        from coverage c join raw_games g on g.speed = c.speed
        where not c.savedRecent order by g.playedAt desc limit 8
      )
    ),
    recent as (select * from candidates order by playedAt desc limit 8),
    recent_games as (
      select r.uci, r.gameId, r.playedAt, r.playedOn,
        w.name as white, b.name as black, r.whiteRating, r.blackRating, r.winner
      from recent r
      left join opening_names w on w.name_id = r.white_id
      left join opening_names b on b.name_id = r.black_id
      order by r.playedAt desc limit 8
    )`;
  return {
    movesSql: `${common} select * from moves;`,
    gamesSql: `${common} select * from recent_games;`,
    combinedSql: `${common} select
      (select json_group_array(json_object(
        'uci',uci,'games',games,'whiteWins',whiteWins,'draws',draws,
        'blackWins',blackWins,'avgOpponentRating',avgOpponentRating
      )) from moves) as movesJson,
      (select json_group_array(json_object(
        'uci',uci,'gameId',gameId,'playedAt',playedAt,'playedOn',playedOn,
        'white',white,'black',black,'whiteRating',whiteRating,
        'blackRating',blackRating,'winner',winner
      )) from recent_games) as recentGamesJson;`,
  };
};

export const buildOpeningExplorerSql = ({
  color,
  endDate,
  keyHex,
  opponent,
  playerMinRating,
  speeds,
  startDate,
  username,
}) => {
  if (!username && !opponent)
    return buildGeneralBucketQueries({ keyHex, speeds, startDate, endDate });
  const playerIdSql = username
    ? `coalesce((select name_id from opening_names where name = ${sqlString(username)} limit 1), (select name_id from opening_names where lower(name) = ${sqlString(username)} limit 1))`
    : "";
  const opponentIdSql = opponent
    ? `coalesce((select name_id from opening_names where name = ${sqlString(opponent)} limit 1), (select name_id from opening_names where lower(name) = ${sqlString(opponent)} limit 1))`
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
  const playerDetailsRatingFilter = `and ${opponentRatingColumn} >= ${playerMinRating}`;

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
        ${playerDetailsRatingFilter}
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
        and (opponent_rating_sum * 1.0 / games) >= ${playerMinRating}
      group by next_uci
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
      ${playerDetailsRatingFilter}
    ${username ? "" : "group by g.game_id, g.next_uci"}
    order by g.played_at desc
    limit 8;
  `;

  return { gamesSql, movesSql, combinedSql: undefined };
};
