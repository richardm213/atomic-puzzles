import { createHash } from "node:crypto";

export const OPENING_EXPLORER_RESPONSE_SCHEMA = "compact-position-extras-v8";

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

const integerOrNull = (value) => {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
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

const hasDefaultGeneralSpeeds = (speeds) =>
  speeds.length === 2 && speeds.includes(0) && speeds.includes(1);

const SAVED_GENERAL_MIN_GAMES = 1_000;

const buildAggregateMovesCte = ({ generalMovesMonthSql, keyHex, speedSql }) => `
  aggregate_moves as (
    select
      next_uci as uci,
      sum(games) as games,
      sum(white_wins) as whiteWins,
      sum(draws) as draws,
      sum(black_wins) as blackWins,
      case
        when sum(rated_games) > 0
        then round(sum(rating_pair_sum) * 1.0 / (sum(rated_games) * 2))
      end as avgOpponentRating
    from opening_position_moves_monthly
    where position_key = X'${keyHex}'
      and speed in (${speedSql})
      ${generalMovesMonthSql}
    group by next_uci
  )
`;

const buildRawGeneralGamesCte = ({ fallbackBlockerCte = "", gamesWhere }) => `
  raw_general_games as (
    select
      g.game_id,
      max(g.next_uci) as next_uci,
      max(g.played_at) as played_at,
      max(g.played_on) as played_on,
      max(g.white_id) as white_id,
      max(g.black_id) as black_id,
      max(g.white_rating) as white_rating,
      max(g.black_rating) as black_rating,
      max(g.winner) as winner
    from opening_position_games g
    where ${gamesWhere}
      ${fallbackBlockerCte ? `and not exists (select 1 from ${fallbackBlockerCte})` : ""}
    group by g.game_id
  )
`;

const rawMovesCte = () => `
  raw_moves as (
    select
      next_uci as uci,
      count(*) as games,
      sum(case when winner = 1 then 1 else 0 end) as whiteWins,
      sum(case when winner = 0 then 1 else 0 end) as draws,
      sum(case when winner = 2 then 1 else 0 end) as blackWins,
      round(avg(
        case
          when white_rating is not null and black_rating is not null
          then (white_rating + black_rating) / 2.0
        end
      )) as avgOpponentRating
    from raw_general_games
    group by next_uci
  )
`;

const rawRecentGamesCte = () => `
  raw_recent_games as (
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
    from raw_general_games g
    left join opening_names white_name on white_name.name_id = g.white_id
    left join opening_names black_name on black_name.name_id = g.black_id
    order by g.played_at desc
    limit 8
  )
`;

const buildAggregateGeneralMovesSql = ({ aggregateMovesCte, rawGeneralGamesCte }) => `
  with
    ${aggregateMovesCte},
    ${rawGeneralGamesCte},
    ${rawMovesCte()}
  select *
  from aggregate_moves
  union all
  select *
  from raw_moves
  where not exists (select 1 from aggregate_moves)
  order by games desc
  limit 12;
`;

const buildHighVolumeGeneralMovesSql = ({ aggregateMovesCte, rawGeneralGamesCte }) => `
  with
    ${aggregateMovesCte},
    aggregate_total as (
      select coalesce(sum(games), 0) as games
      from aggregate_moves
    ),
    ${rawGeneralGamesCte},
    ${rawMovesCte()}
  select *
  from aggregate_moves
  where exists (select 1 from aggregate_total where games >= ${SAVED_GENERAL_MIN_GAMES})
  union all
  select *
  from raw_moves
  where not exists (select 1 from aggregate_total where games >= ${SAVED_GENERAL_MIN_GAMES})
  order by games desc
  limit 12;
`;

const buildAggregateGeneralRecentGamesSql = ({ rawGeneralGamesCte, recentGamesCte }) => `
  with
    ${recentGamesCte},
    ${rawGeneralGamesCte},
    ${rawRecentGamesCte()}
  select *
  from recent_games
  union all
  select *
  from raw_recent_games
  where not exists (select 1 from recent_games)
  order by playedAt desc
  limit 8;
`;

const buildHighVolumeGeneralRecentGamesSql = ({
  aggregateMovesCte,
  rawGeneralGamesCte,
  recentGamesCte,
}) => `
  with
    ${aggregateMovesCte},
    aggregate_total as (
      select coalesce(sum(games), 0) as games
      from aggregate_moves
    ),
    ${recentGamesCte},
    ${rawGeneralGamesCte},
    ${rawRecentGamesCte()}
  select *
  from recent_games
  where exists (
    select 1
    from aggregate_total
    where games >= ${SAVED_GENERAL_MIN_GAMES}
      and exists (select 1 from recent_games)
  )
  union all
  select *
  from raw_recent_games
  where not exists (
    select 1
    from aggregate_total
    where games >= ${SAVED_GENERAL_MIN_GAMES}
      and exists (select 1 from recent_games)
  )
  order by playedAt desc
  limit 8;
`;

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
  const startMonth = monthKeyFromDateKey(startDate);
  const endMonth = monthKeyFromDateKey(endDate);
  const edgesDateSql = `
    ${startDate ? `and played_on >= ${startDate}` : ""}
    ${endDate ? `and played_on <= ${endDate}` : ""}
  `;
  const gamesDateSql = `
    ${startDate ? `and g.played_on >= ${startDate}` : ""}
    ${endDate ? `and g.played_on <= ${endDate}` : ""}
  `;
  const generalMovesMonthSql = `
    ${startMonth ? `and played_month >= ${startMonth}` : ""}
    ${endMonth ? `and played_month <= ${endMonth}` : ""}
  `;
  const generalGamesDateSql = `
    ${startDate ? `and rg.played_on >= ${startDate}` : ""}
    ${endDate ? `and rg.played_on <= ${endDate}` : ""}
  `;
  const generalRecentGameSelects = speeds
    .map(
      (speed) => `
        select *
        from (
          select
            rg.next_uci as uci,
            rg.game_id as gameId,
            rg.played_at as playedAt,
            rg.played_on as playedOn,
            white_name.name as white,
            black_name.name as black,
            rg.white_rating as whiteRating,
            rg.black_rating as blackRating,
            rg.winner as winner
          from opening_position_recent_games rg
          left join opening_names white_name on white_name.name_id = rg.white_id
          left join opening_names black_name on black_name.name_id = rg.black_id
          where rg.position_key = X'${keyHex}'
            and rg.speed = ${speed}
            ${generalGamesDateSql}
          order by rg.played_at desc
          limit 8
        )
      `,
    )
    .join("\n      union all\n");
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
  const isDefaultGeneralRequest = !startDate && !endDate && hasDefaultGeneralSpeeds(speeds);
  const aggregateMovesCte = buildAggregateMovesCte({
    generalMovesMonthSql,
    keyHex,
    speedSql,
  });
  const recentGamesCte = `
    recent_games as (
      ${generalRecentGameSelects}
    )
  `;
  const rawGeneralGamesCte = (fallbackBlockerCte = "") =>
    buildRawGeneralGamesCte({ fallbackBlockerCte, gamesWhere });
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
        and (opponent_rating_sum * 1.0 / games) >= ${playerMinRating}
      group by next_uci
      order by games desc
      limit 12;
    `
      : isDefaultGeneralRequest
        ? buildHighVolumeGeneralMovesSql({
            aggregateMovesCte,
            rawGeneralGamesCte: rawGeneralGamesCte(
              `aggregate_total where games >= ${SAVED_GENERAL_MIN_GAMES}`,
            ),
          })
        : buildAggregateGeneralMovesSql({
            aggregateMovesCte,
            rawGeneralGamesCte: rawGeneralGamesCte("aggregate_moves"),
          });

  const gamesSql =
    username || opponent
      ? `
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
  `
      : isDefaultGeneralRequest
        ? buildHighVolumeGeneralRecentGamesSql({
            aggregateMovesCte,
            rawGeneralGamesCte: rawGeneralGamesCte(
              `aggregate_total where games >= ${SAVED_GENERAL_MIN_GAMES} and exists (select 1 from recent_games)`,
            ),
            recentGamesCte,
          })
        : buildAggregateGeneralRecentGamesSql({
            rawGeneralGamesCte: rawGeneralGamesCte("recent_games"),
            recentGamesCte,
          });

  return { gamesSql, movesSql };
};
