import { createClient } from "@supabase/supabase-js";

import { getArchiveClient } from "../netlify/archive/client";

type PlayerSummaryRow = {
  username: string;
  archive_start_date: string | null;
  total_games: number;
  updated_at: string;
};

const supabaseUrl = process.env.VITE_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase service credentials are not configured.");
}

const archive = getArchiveClient();
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const result =
  await archive.execute(`select p.username,min(m.start_ts) start_ts,count(g.game_id) total_games
  from players p
  left join matches m on m.player_1_id=p.id or m.player_2_id=p.id
  left join games g on g.match_id=m.id
  group by p.id,p.username
  order by p.id`);
const updatedAt = new Date().toISOString();
const rows: PlayerSummaryRow[] = result.rows.map((row) => {
  const timestamp =
    row.start_ts === null || row.start_ts === undefined ? null : Number(row.start_ts);
  const milliseconds =
    timestamp !== null && timestamp < 10_000_000_000 ? timestamp * 1_000 : timestamp;
  return {
    username: String(row.username).trim().toLowerCase(),
    archive_start_date:
      milliseconds === null || !Number.isFinite(milliseconds)
        ? null
        : new Date(milliseconds).toISOString().slice(0, 10),
    total_games: Number(row.total_games) || 0,
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
