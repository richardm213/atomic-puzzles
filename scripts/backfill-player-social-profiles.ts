import { createClient } from "@supabase/supabase-js";

import { getArchiveClient } from "../netlify/archive/client";
import {
  PLAYER_RATING_SNAPSHOT_DATE,
  type StoredPlayerRating,
} from "../shared/domain/playerSocial";

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
const ratingResult = await archive.execute({
  sql: `select p.username,r.mode,r.rating/10.0 rating,r.rd/10.0 rd
    from weekly_ratings r
    join players p on p.id=r.username_id
    where r.week=(
      select max(snapshot.week) from weekly_ratings snapshot
      where snapshot.username_id=r.username_id and snapshot.mode=r.mode and snapshot.week<=?
    )
    order by p.id,r.mode`,
  args: [PLAYER_RATING_SNAPSHOT_DATE],
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
    ratings_snapshot_date: PLAYER_RATING_SNAPSHOT_DATE,
    updated_at: updatedAt,
  };
});

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
