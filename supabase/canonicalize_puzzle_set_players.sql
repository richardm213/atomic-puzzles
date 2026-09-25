-- Replace puzzle-set nicknames and historical aliases with the canonical
-- usernames used by matches/data/aliases2.csv and the matches players table.
-- Run after puzzle_sets.sql and player_nicknames.sql.

alter table public.puzzle_sets
  add column if not exists source_id text;

drop index if exists public.puzzle_sets_identity_unique;

create or replace function public.canonical_puzzle_player_username(p_username text)
returns text
language sql
immutable
set search_path = public
as $$
  select case lower(btrim(coalesce(p_username, '')))
    when 'max' then 'maxwellssilvrhammer'
    when 'randoom' then 'randoomplayer'
    when 'wolfram' then 'wolfram_ep'
    when 'seaside' then 'seaside_tiramisu'
    when 'noz' then 'neverofzero'
    when 'jsf' then 'jakestatefarm'
    when 'rkr' then 'rkrounit'
    when 'lesha' then 'lesha2002'
    when 'rabbie' then 'rabbier'
    when 'trash' then 'absolutelytrash'
    when 'trk' then 'ihatespammers'
    when 'qed' then 'queeneatingdragon'
    when 'unique_openings' then 'absolutelytrash'
    when 'beafraidofyourdesire' then 'maracker'
    when 'blackjack' then 'blackjack84'
    when 'quasa' then 'quasabianth'
    else lower(btrim(coalesce(p_username, '')))
  end;
$$;

create or replace function public.normalize_puzzle_set_players(p_players text[])
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(array_agg(player order by player), '{}'::text[])
  from (
    select distinct public.canonical_puzzle_player_username(value) as player
    from unnest(coalesce(p_players, '{}'::text[])) as supplied(value)
    where public.canonical_puzzle_player_username(value) <> ''
  ) normalized;
$$;

update public.puzzle_sets
set players = public.normalize_puzzle_set_players(players)
where players is distinct from public.normalize_puzzle_set_players(players);

create temporary table puzzle_set_alias_merge on commit drop as
select id as duplicate_id,
       min(id) over (
         partition by lower(btrim(event_name)), event_date, players
       ) as keep_id
from public.puzzle_sets;

delete from puzzle_set_alias_merge where duplicate_id = keep_id;

update public.puzzles puzzle
set puzzle_set_id = merge.keep_id
from puzzle_set_alias_merge merge
where puzzle.puzzle_set_id = merge.duplicate_id;

delete from public.puzzle_sets puzzle_set
using puzzle_set_alias_merge merge
where puzzle_set.id = merge.duplicate_id;

update public.puzzles
set players = public.normalize_puzzle_set_players(players)
where players is distinct from public.normalize_puzzle_set_players(players);

update public.puzzles_queue
set players = public.normalize_puzzle_set_players(players)
where players is distinct from public.normalize_puzzle_set_players(players);

create unique index puzzle_sets_identity_unique
  on public.puzzle_sets (
    lower(btrim(event_name)),
    event_date,
    public.normalize_puzzle_set_players(players)
  );

notify pgrst, 'reload schema';
