import { createHash } from "node:crypto";

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
