-- Database-backed tournament catalog, awards, and structured archives.

begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournament_seeds'::regclass
      and conname = 'tournament_seeds_top_16_check'
  ) then
    alter table public.tournament_seeds
      add constraint tournament_seeds_top_16_check check (seed between 1 and 16);
  end if;
end;
$$;

create table if not exists public.tournament_catalog (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]*$'),
  series_key text not null check (series_key ~ '^[a-z0-9][a-z0-9_-]*$'),
  series_name text not null check (length(btrim(series_name)) between 1 and 120),
  title text not null check (length(btrim(title)) between 1 and 120),
  heading_title text check (heading_title is null or length(btrim(heading_title)) between 1 and 160),
  year smallint not null check (year between 1900 and 2200),
  start_date date,
  end_date date,
  status text not null default 'pending' check (status in ('available', 'pending')),
  match_mode text not null default 'blitz'
    check (match_mode in ('hyperbullet', 'bullet', 'blitz', 'wolfrandom', 'atomic960')),
  hide_start_round_controls boolean not null default false,
  default_main_bracket_start_round text,
  complete_main_bracket_from_round text,
  trophy_asset_path text,
  show_champion boolean not null default true,
  home_feature_order smallint,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tournament_catalog
  add column if not exists home_feature_order smallint;

alter table public.tournament_catalog
  add column if not exists start_date date;

alter table public.tournament_catalog
  add column if not exists end_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.tournament_catalog'::regclass
      and conname = 'tournament_catalog_date_range_check'
  ) then
    alter table public.tournament_catalog
      add constraint tournament_catalog_date_range_check
      check (end_date is null or start_date is null or end_date >= start_date);
  end if;
end;
$$;

create index if not exists tournament_catalog_archive_order_idx
  on public.tournament_catalog (status, year desc, display_order, id);

create table if not exists public.tournament_awards (
  tournament_id text not null
    references public.tournament_catalog(id) on update cascade on delete cascade,
  player_name text not null check (
    player_name = lower(btrim(player_name)) and length(player_name) between 1 and 100
  ),
  award_key text not null check (award_key ~ '^[a-z0-9][a-z0-9_-]*$'),
  placement smallint not null check (placement > 0),
  label text not null check (length(btrim(label)) between 1 and 80),
  title text not null check (length(btrim(title)) between 1 and 160),
  placement_label text not null default 'Champion',
  awarded_on date not null,
  prestige smallint not null default 1000 check (prestige between 0 and 1000),
  asset_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tournament_id, award_key),
  unique (tournament_id, placement),
  unique (award_key)
);

create index if not exists tournament_awards_player_date_idx
  on public.tournament_awards (player_name, awarded_on desc);

create table if not exists public.tournament_archives (
  tournament_id text primary key
    references public.tournament_catalog(id) on update cascade on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

-- Keep updated_at useful without requiring a project-specific trigger helper.
create or replace function public.set_tournament_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tournament_catalog_set_updated_at on public.tournament_catalog;
create trigger tournament_catalog_set_updated_at
before update on public.tournament_catalog
for each row execute function public.set_tournament_updated_at();

drop trigger if exists tournament_awards_set_updated_at on public.tournament_awards;
create trigger tournament_awards_set_updated_at
before update on public.tournament_awards
for each row execute function public.set_tournament_updated_at();

create or replace view public.tournament_winners
with (security_invoker = true)
as
select
  t.id as tournament_id,
  t.year,
  t.series_key,
  t.series_name,
  a.player_name,
  a.awarded_on
from public.tournament_catalog t
join public.tournament_awards a on a.tournament_id = t.id
where a.placement = 1;

create or replace view public.tournament_profile_trophies
with (security_invoker = true)
as
select
  a.award_key,
  a.player_name,
  a.label,
  a.title,
  coalesce(a.asset_path, t.trophy_asset_path) as asset_path,
  '/tournaments/' || case when t.id = 'wr-arena2026' then 'wolfarena2026' else t.id end as href,
  to_char(a.awarded_on, 'Mon YYYY') as date_label,
  a.awarded_on as date_value,
  a.placement_label,
  a.prestige
from public.tournament_awards a
join public.tournament_catalog t on t.id = a.tournament_id;

alter table public.tournament_catalog enable row level security;
alter table public.tournament_awards enable row level security;
alter table public.tournament_archives enable row level security;

drop policy if exists "Tournament catalog is publicly readable" on public.tournament_catalog;
create policy "Tournament catalog is publicly readable"
  on public.tournament_catalog for select
  to anon, authenticated
  using (true);

drop policy if exists "Tournament awards are publicly readable" on public.tournament_awards;
create policy "Tournament awards are publicly readable"
  on public.tournament_awards for select
  to anon, authenticated
  using (true);

drop policy if exists "Tournament archives are publicly readable" on public.tournament_archives;
create policy "Tournament archives are publicly readable"
  on public.tournament_archives for select
  to anon, authenticated
  using (true);

revoke all on public.tournament_catalog from anon, authenticated;
revoke all on public.tournament_awards from anon, authenticated;
revoke all on public.tournament_archives from anon, authenticated;
revoke all on public.tournament_winners from anon, authenticated;
revoke all on public.tournament_profile_trophies from anon, authenticated;
grant select on public.tournament_catalog to anon, authenticated;
grant select on public.tournament_awards to anon, authenticated;
grant select on public.tournament_archives to anon, authenticated;
grant select on public.tournament_winners to anon, authenticated;
grant select on public.tournament_profile_trophies to anon, authenticated;
grant select, insert, update, delete on public.tournament_catalog to service_role;
grant select, insert, update, delete on public.tournament_awards to service_role;
grant select, insert, update, delete on public.tournament_archives to service_role;

commit;

notify pgrst, 'reload schema';

-- Useful reads for the app:
--
-- Tournament archive/catalog:
-- select * from public.tournament_catalog
-- where status = 'available'
-- order by year desc, display_order, id;
--
-- Winners: select * from public.tournament_winners;
--
-- Profile trophies (asset falls back to the tournament asset):
-- select * from public.tournament_profile_trophies
-- where player_name = lower(:username)
-- order by date_value desc;
