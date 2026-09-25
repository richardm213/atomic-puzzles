-- Optional short display names for canonical match-archive usernames.

create table if not exists public.player_nicknames (
  username text not null,
  nickname text not null,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (username, nickname),
  constraint player_nicknames_username_lowercase_check
    check (username = lower(btrim(username)) and username <> ''),
  constraint player_nicknames_nickname_lowercase_check
    check (nickname = lower(btrim(nickname)) and nickname <> '')
);

create unique index if not exists player_nicknames_one_primary_per_username
  on public.player_nicknames (username)
  where is_primary;

insert into public.player_nicknames (username, nickname, is_primary)
values
  ('maxwellssilvrhammer', 'max', true),
  ('randoomplayer', 'randoom', true),
  ('wolfram_ep', 'wolfram', true),
  ('seaside_tiramisu', 'seaside', true),
  ('neverofzero', 'noz', true),
  ('jakestatefarm', 'jsf', true),
  ('rkrounit', 'rkr', true),
  ('lesha2002', 'lesha', true),
  ('rabbier', 'rabbie', true),
  ('quasabianth', 'quasa', true),
  ('absolutelytrash', 'trash', true),
  ('ihatespammers', 'trk', true),
  ('queeneatingdragon', 'qed', true)
on conflict (username, nickname) do update
set is_primary = excluded.is_primary,
    updated_at = now();

alter table public.player_nicknames enable row level security;

drop policy if exists "Player nicknames are publicly readable" on public.player_nicknames;
create policy "Player nicknames are publicly readable"
  on public.player_nicknames
  for select
  to anon, authenticated
  using (true);

grant select on public.player_nicknames to anon, authenticated;
grant select, insert, update, delete on public.player_nicknames to service_role;

comment on table public.player_nicknames is
  'Optional short display names keyed by the canonical username stored in the matches archive.';

notify pgrst, 'reload schema';
