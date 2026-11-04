-- Player ratings are read live from the Turso archive. Supabase keeps only
-- profile-owned social fields and the archive start/game summary.
begin;

alter table public.player_social_profiles
  drop column if exists ratings,
  drop column if exists ratings_snapshot_date;

commit;
