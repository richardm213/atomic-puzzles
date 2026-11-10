-- Engine continuations are independent of AtomicDB's opening cache and its refresh timestamp.
alter table public.game_analysis_openings
  add column if not exists supplement jsonb
  check (supplement is null or jsonb_typeof(supplement) = 'array');
