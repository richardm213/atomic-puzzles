alter table public.tournament_matches
  add column if not exists played_on date;

create index if not exists tournament_matches_played_on_idx
  on public.tournament_matches (played_on);
