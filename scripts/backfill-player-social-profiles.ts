import { createClient } from "@supabase/supabase-js";

import { getArchiveClient } from "../netlify/archive/client";
import { type StoredPlayerRating } from "../shared/domain/playerSocial";

type PlayerSummaryRow = {
  username: string;
  archive_start_date: string | null;
  total_games: number;
  ratings: StoredPlayerRating[];
  ratings_snapshot_date: string;
  updated_at: string;
};

const modeNames = ["hyperbullet", "bullet", "blitz", "wolfrandom", "atomic960", "rapid"];

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase service credentials are not configured.");
}

const archive = getArchiveClient();
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const summaryResult = await archive.execute(`with player_matches as (
    select player_1_id player_id,id,start_ts from matches
    union all
    select player_2_id player_id,id,start_ts from matches
  )
  select p.username,min(m.start_ts) start_ts,count(g.game_id) total_games
  from players p
  left join player_matches m on m.player_id=p.id
  left join games g on g.match_id=m.id
  group by p.id,p.username
  order by p.id`);
const latestRatingWeekResult = await archive.execute("select max(week) week from weekly_ratings");
const latestRatingWeek = String(latestRatingWeekResult.rows[0]?.week ?? "");
if (!/^\d{4}-\d{2}-\d{2}$/.test(latestRatingWeek)) {
  throw new Error("The Turso archive does not contain a valid latest rating week.");
}
const ratingResult = await archive.execute({
  sql: `select p.username,r.mode,r.rating/10.0 rating,r.rd/10.0 rd
    from weekly_ratings r
    join players p on p.id=r.username_id
    where r.week=(
      select max(snapshot.week) from weekly_ratings snapshot
      where snapshot.username_id=r.username_id and snapshot.mode=r.mode and snapshot.week<=?
    )
    order by p.id,r.mode`,
  args: [latestRatingWeek],
});
const ratingsByUsername = new Map<string, StoredPlayerRating[]>();
for (const row of ratingResult.rows) {
  const username = String(row.username).trim().toLowerCase();
  const mode = modeNames[Number(row.mode)] ?? "";
  if (!mode) continue;
  const rating = row.rating === null || row.rating === undefined ? null : Number(row.rating);
  const rd = row.rd === null || row.rd === undefined ? null : Number(row.rd);
  ratingsByUsername.set(username, [
    ...(ratingsByUsername.get(username) ?? []),
    {
      tc: mode,
      rating: Number.isFinite(rating) ? rating : null,
      rd: Number.isFinite(rd) ? rd : null,
    },
  ]);
}
const updatedAt = new Date().toISOString();
const rows: PlayerSummaryRow[] = summaryResult.rows.map((row) => {
  const timestamp =
    row.start_ts === null || row.start_ts === undefined ? null : Number(row.start_ts);
  const milliseconds =
    timestamp !== null && timestamp < 10_000_000_000 ? timestamp * 1_000 : timestamp;
  const username = String(row.username).trim().toLowerCase();
  return {
    username,
    archive_start_date:
      milliseconds === null || !Number.isFinite(milliseconds)
        ? null
        : new Date(milliseconds).toISOString().slice(0, 10),
    total_games: Number(row.total_games) || 0,
    ratings: ratingsByUsername.get(username) ?? [],
    ratings_snapshot_date: latestRatingWeek,
    updated_at: updatedAt,
  };
});
const rowsByUsername = new Map(rows.map((row) => [row.username, row]));
const existingUsernames: string[] = [];
for (let offset = 0; ; offset += 1_000) {
  const { data, error } = await supabase
    .from("player_social_profiles")
    .select("username")
    .order("username")
    .range(offset, offset + 999);
  if (error) throw new Error(`Unable to load existing player profiles: ${error.message}`);
  existingUsernames.push(...(data ?? []).map((row) => String(row.username)));
  if ((data?.length ?? 0) < 1_000) break;
}
for (const username of existingUsernames) {
  if (rowsByUsername.has(username)) continue;
  const aliasResult = await archive.execute({
    sql: `select p.username from aliases a join players p on p.id=a.player_id
      where a.alias=? or (a.count_games<>'p' and lower(a.alias)=?)
      order by case when a.alias=? then 0 else 1 end limit 1`,
    args: [username, username, username],
  });
  const canonicalUsername = String(aliasResult.rows[0]?.username ?? "").toLowerCase();
  const canonicalRow = rowsByUsername.get(canonicalUsername);
  if (canonicalRow) rows.push({ ...canonicalRow, username });
}

for (let offset = 0; offset < rows.length; offset += 500) {
  const batch = rows.slice(offset, offset + 500);
  const { error } = await supabase
    .from("player_social_profiles")
    .upsert(batch, { onConflict: "username" });
  if (error) throw new Error(`Unable to backfill player profiles: ${error.message}`);
  process.stdout.write(
    `\rBackfilled ${Math.min(offset + batch.length, rows.length)}/${rows.length}`,
  );
}

process.stdout.write("\n");
