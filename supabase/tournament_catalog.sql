-- Database-backed tournament catalog and championship awards.
--
-- This moves the hardcoded tournament metadata from tournaments.ts and the
-- hardcoded championship winners from profileTrophies.tsx into Supabase.
-- Existing tournament_matches rows remain unchanged. Tournament seeds are
-- intentionally capped at 1-16; lower-priority seeds are removed below.

begin;

delete from public.tournament_seeds
where seed < 1 or seed > 16;

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

-- Catalog metadata currently hardcoded in src/lib/matches/tournaments.ts.
delete from public.tournament_catalog where id = 'acl';

insert into public.tournament_catalog (
  id,
  series_key,
  series_name,
  title,
  heading_title,
  year,
  start_date,
  end_date,
  status,
  match_mode,
  hide_start_round_controls,
  default_main_bracket_start_round,
  complete_main_bracket_from_round,
  trophy_asset_path,
  show_champion,
  home_feature_order,
  display_order
)
values
  ('acl-s2', 'acl', 'Atomic Chess League', 'Atomic Chess League Season 2', null, 2026, '2026-02-01', '2026-03-29', 'available', 'blitz', true, null, null, '/images/acl-trophies/league-reactor-v2.png', false, null, 1),
  ('awc2026', 'awc', 'Atomic World Championship', 'AWC 2026', null, 2026, '2026-09-07', null, 'available', 'blitz', false, 'Round of 16', 'Round of 16', '/images/awc-trophies/awc.png', true, 10, 10),
  ('aoc2026', 'aoc', 'Atomic Openings Championship', 'AOC 2026', 'Atomic Openings Championship 2026', 2026, '2026-07-02', '2026-07-31', 'available', 'blitz', false, null, null, '/images/awc-trophies/atomic-openings-championship.png', true, null, 20),
  ('ahc2026', 'ahc', 'Atomic Hyper Championship', 'AHC 2026', 'Atomic Hyper Championship 2026', 2026, '2026-07-10', '2026-08-19', 'available', 'hyperbullet', false, null, 'Round of 32', '/images/awc-trophies/atomic-hyper-championship.png', true, 20, 30),
  ('ccac2026', 'ccac', 'Chess.com Atomic Championship', 'CCAC 2026', 'Chess.com Atomic Championship 2026', 2026, '2026-03-04', '2026-03-06', 'available', 'blitz', true, null, null, '/images/awc-trophies/chesscomatomic.png', true, 30, 40),
  ('acl-s1', 'acl', 'Atomic Chess League', 'Atomic Chess League Season 1', null, 2025, '2025-07-01', '2025-08-30', 'available', 'blitz', true, null, null, '/images/acl-trophies/team-orbit.png', false, null, 2),
  ('awc2025', 'awc', 'Atomic World Championship', 'AWC 2025', null, 2025, '2025-09-03', '2025-12-20', 'available', 'blitz', false, null, null, '/images/awc-trophies/awc.png', true, null, 10),
  ('awc2024', 'awc', 'Atomic World Championship', 'AWC 2024', null, 2024, '2024-09-11', '2024-12-21', 'available', 'blitz', false, null, null, '/images/awc-trophies/awc.png', true, null, 10),
  ('awc2023', 'awc', 'Atomic World Championship', 'AWC 2023', null, 2023, '2023-09-11', '2023-12-10', 'available', 'blitz', false, null, null, '/images/awc-trophies/awc.png', true, null, 10),
  ('awc2022', 'awc', 'Atomic World Championship', 'AWC 2022', null, 2022, '2022-09-12', '2023-03-22', 'available', 'blitz', false, null, null, '/images/awc-trophies/awc.png', true, null, 10),
  ('awc2021', 'awc', 'Atomic World Championship', 'AWC 2021', null, 2021, '2021-09-13', '2021-12-05', 'available', 'blitz', false, null, null, '/images/awc-trophies/awc.png', true, null, 10),
  ('awc2020', 'awc', 'Atomic World Championship', 'AWC 2020', null, 2020, '2020-09-07', '2020-11-15', 'available', 'blitz', false, null, null, '/images/awc-trophies/awc.png', true, null, 10),
  ('awc2019', 'awc', 'Atomic World Championship', 'AWC 2019', null, 2019, '2019-09-09', '2019-11-24', 'available', 'blitz', false, null, null, '/images/awc-trophies/awc.png', true, null, 10),
  ('awc2018', 'awc', 'Atomic World Championship', 'AWC 2018', null, 2018, '2018-09-24', '2018-12-22', 'available', 'blitz', false, null, null, '/images/awc-trophies/awc.png', true, null, 10),
  ('awc2017', 'awc', 'Atomic World Championship', 'AWC 2017', null, 2017, '2017-10-30', '2017-12-14', 'available', 'blitz', false, null, null, '/images/awc-trophies/awc.png', true, null, 10),
  ('awc2016', 'awc', 'Atomic World Championship', 'AWC 2016', null, 2016, '2016-09-12', '2016-12-04', 'available', 'blitz', false, null, null, '/images/awc-trophies/awc.png', true, null, 10)
on conflict (id) do update set
  series_key = excluded.series_key,
  series_name = excluded.series_name,
  title = excluded.title,
  heading_title = excluded.heading_title,
  year = excluded.year,
  start_date = excluded.start_date,
  end_date = excluded.end_date,
  status = excluded.status,
  match_mode = excluded.match_mode,
  hide_start_round_controls = excluded.hide_start_round_controls,
  default_main_bracket_start_round = excluded.default_main_bracket_start_round,
  complete_main_bracket_from_round = excluded.complete_main_bracket_from_round,
  trophy_asset_path = excluded.trophy_asset_path,
  show_champion = excluded.show_champion,
  home_feature_order = excluded.home_feature_order,
  display_order = excluded.display_order;

-- Canonical champions. awarded_on preserves the month labels currently used by
-- profile trophies; replace a date with the exact final date when known.
insert into public.tournament_awards (
  tournament_id,
  player_name,
  award_key,
  placement,
  label,
  title,
  placement_label,
  awarded_on,
  prestige,
  asset_path
)
values
  ('awc2016', 'tipau', 'awc-2016', 1, 'AWC 2016', 'Atomic World Champion 2016', 'Champion', '2016-12-01', 1000, null),
  ('awc2017', 'arka50', 'awc-2017', 1, 'AWC 2017', 'Atomic World Champion 2017', 'Champion', '2017-12-01', 1000, null),
  ('awc2018', 'arka50', 'awc-2018', 1, 'AWC 2018', 'Atomic World Champion 2018', 'Champion', '2018-12-01', 1000, null),
  ('awc2019', 'onubense', 'awc-2019', 1, 'AWC 2019', 'Atomic World Champion 2019', 'Champion', '2019-12-01', 1000, null),
  ('awc2020', 'arka50', 'awc-2020', 1, 'AWC 2020', 'Atomic World Champion 2020', 'Champion', '2020-12-01', 1000, null),
  ('awc2021', 'fast-tsunami', 'awc-2021', 1, 'AWC 2021', 'Atomic World Champion 2021', 'Champion', '2021-12-01', 1000, null),
  ('awc2022', 'sutcunuri', 'awc-2022', 1, 'AWC 2022', 'Atomic World Champion 2022', 'Champion', '2022-12-01', 1000, null),
  ('awc2023', 'vlad_00', 'awc-2023', 1, 'AWC 2023', 'Atomic World Champion 2023', 'Champion', '2023-12-01', 1000, null),
  ('awc2024', 'natso', 'awc-2024', 1, 'AWC 2024', 'Atomic World Champion 2024', 'Champion', '2024-12-01', 1000, null),
  ('awc2025', 'neverofzero', 'awc-2025', 1, 'AWC 2025', 'Atomic World Champion 2025', 'Champion', '2025-12-01', 1000, null),
  ('aoc2026', 'jakestatefarm', 'atomic-openings-2026', 1, 'AOC 2026', '2026 Atomic Openings Champion', 'Champion', '2026-07-31', 970, null),
  ('ahc2026', 'rkrounit', 'atomic-hyper-2026', 1, 'AHC 2026', '2026 Atomic Hyper Champion', 'Champion', '2026-08-19', 970, null),
  ('ccac2026', 'wolfram_ep', 'chesscom-atomic-2026', 1, 'CC 2026', '2026 Chess.com Atomic Champion', 'Champion', '2026-03-01', 980, null)
on conflict (tournament_id, award_key) do update set
  player_name = excluded.player_name,
  placement = excluded.placement,
  label = excluded.label,
  title = excluded.title,
  placement_label = excluded.placement_label,
  awarded_on = excluded.awarded_on,
  prestige = excluded.prestige,
  asset_path = excluded.asset_path;

-- ACL awards are team trophies. Each winning roster member gets the season's
-- trophy, with the division retained in the label and title.
insert into public.tournament_awards (
  tournament_id,
  player_name,
  award_key,
  placement,
  label,
  title,
  placement_label,
  awarded_on,
  prestige,
  asset_path
)
values
  ('acl-s2', 'jakestatefarm', 'acl-s2-elite-jakestatefarm', 1, 'ACL S2', 'ACL Season 2 Elite League Champion', 'Elite League champion', '2026-03-29', 960, null),
  ('acl-s2', 'rkrounit', 'acl-s2-elite-rkrounit', 2, 'ACL S2', 'ACL Season 2 Elite League Champion', 'Elite League champion', '2026-03-29', 960, null),
  ('acl-s2', 'maracker', 'acl-s2-elite-maracker', 3, 'ACL S2', 'ACL Season 2 Elite League Champion', 'Elite League champion', '2026-03-29', 960, null),
  ('acl-s2', 'studieb', 'acl-s2-elite-studieb', 4, 'ACL S2', 'ACL Season 2 Elite League Champion', 'Elite League champion', '2026-03-29', 960, null),
  ('acl-s2', 'orcinus_orca', 'acl-s2-challenger-orcinus_orca', 5, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s2', 'absolutelytrash', 'acl-s2-challenger-absolutelytrash', 6, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s2', 'knightblade_123', 'acl-s2-challenger-knightblade_123', 7, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s2', 'marcothetiger', 'acl-s2-challenger-marcothetiger', 8, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s2', 'f55555', 'acl-s2-challenger-f55555', 9, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s2', 'i-win-00', 'acl-s2-challenger-i-win-00', 10, 'ACL S2', 'ACL Season 2 Challenger League Champion', 'Challenger League champion', '2026-03-29', 940, null),
  ('acl-s1', 'natso', 'acl-s1-elite-natso', 1, 'ACL S1', 'ACL Season 1 Elite League Champion', 'Elite League champion', '2025-08-30', 960, null),
  ('acl-s1', 'neverofzero', 'acl-s1-elite-neverofzero', 2, 'ACL S1', 'ACL Season 1 Elite League Champion', 'Elite League champion', '2025-08-30', 960, null),
  ('acl-s1', 'rechesster', 'acl-s1-elite-rechesster', 3, 'ACL S1', 'ACL Season 1 Elite League Champion', 'Elite League champion', '2025-08-30', 960, null),
  ('acl-s1', 'rkrounit', 'acl-s1-elite-rkrounit', 4, 'ACL S1', 'ACL Season 1 Elite League Champion', 'Elite League champion', '2025-08-30', 960, null),
  ('acl-s1', 'rabbier', 'acl-s1-challenger-rabbier', 5, 'ACL S1', 'ACL Season 1 Challenger League Champion', 'Challenger League champion', '2025-08-30', 940, null),
  ('acl-s1', 'dandan2016', 'acl-s1-challenger-dandan2016', 6, 'ACL S1', 'ACL Season 1 Challenger League Champion', 'Challenger League champion', '2025-08-30', 940, null),
  ('acl-s1', 'studieb', 'acl-s1-challenger-studieb', 7, 'ACL S1', 'ACL Season 1 Challenger League Champion', 'Challenger League champion', '2025-08-30', 940, null),
  ('acl-s1', 'bercerk_atim', 'acl-s1-challenger-bercerk_atim', 8, 'ACL S1', 'ACL Season 1 Challenger League Champion', 'Challenger League champion', '2025-08-30', 940, null),
  ('acl-s1', 'jmilie', 'acl-s1-challenger-jmilie', 9, 'ACL S1', 'ACL Season 1 Challenger League Champion', 'Challenger League champion', '2025-08-30', 940, null)
on conflict (tournament_id, award_key) do update set
  player_name = excluded.player_name,
  placement = excluded.placement,
  label = excluded.label,
  title = excluded.title,
  placement_label = excluded.placement_label,
  awarded_on = excluded.awarded_on,
  prestige = excluded.prestige,
  asset_path = excluded.asset_path;

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

revoke all on public.tournament_catalog from anon, authenticated;
revoke all on public.tournament_awards from anon, authenticated;
revoke all on public.tournament_winners from anon, authenticated;
revoke all on public.tournament_profile_trophies from anon, authenticated;
grant select on public.tournament_catalog to anon, authenticated;
grant select on public.tournament_awards to anon, authenticated;
grant select on public.tournament_winners to anon, authenticated;
grant select on public.tournament_profile_trophies to anon, authenticated;
grant select, insert, update, delete on public.tournament_catalog to service_role;
grant select, insert, update, delete on public.tournament_awards to service_role;

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
