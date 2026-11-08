begin;

create table if not exists public.player_social_profiles (
  username text primary key,
  flair text,
  country_code text,
  archive_start_date date,
  total_games bigint not null default 0 check (total_games >= 0),
  updated_at timestamptz not null default now(),
  constraint player_social_profiles_username_check
    check (username = lower(btrim(username)) and username ~ '^[a-z0-9_-]{1,100}$'),
  constraint player_social_profiles_flair_length_check
    check (flair is null or char_length(flair) between 1 and 8),
  constraint player_social_profiles_country_code_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$')
);

alter table public.player_social_profiles
  add column if not exists country_code text;

alter table public.player_social_profiles
  drop constraint if exists player_social_profiles_country_code_check,
  add constraint player_social_profiles_country_code_check
    check (country_code is null or country_code ~ '^[A-Z]{2}$');

-- Ratings are read live from the archive; remove obsolete cached snapshots.
alter table public.player_social_profiles
  drop column if exists ratings,
  drop column if exists ratings_snapshot_date;

alter table public.player_social_profiles enable row level security;
revoke all on public.player_social_profiles from anon, authenticated;
grant select (username, flair, country_code) on public.player_social_profiles to anon, authenticated;

commit;
