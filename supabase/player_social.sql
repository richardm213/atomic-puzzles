begin;

create table if not exists public.player_social_profiles (
  username text primary key,
  flair text,
  archive_start_date date,
  total_games bigint not null default 0 check (total_games >= 0),
  ratings jsonb not null default '[]'::jsonb,
  ratings_snapshot_date date,
  updated_at timestamptz not null default now(),
  constraint player_social_profiles_username_check
    check (username = lower(btrim(username)) and username ~ '^[a-z0-9_-]{1,100}$'),
  constraint player_social_profiles_flair_length_check
    check (flair is null or char_length(flair) between 1 and 8)
);

alter table public.player_social_profiles
  add column if not exists ratings jsonb not null default '[]'::jsonb,
  add column if not exists ratings_snapshot_date date;

alter table public.player_social_profiles enable row level security;
revoke all on public.player_social_profiles from anon, authenticated;
grant select (username, flair) on public.player_social_profiles to anon, authenticated;

commit;
