-- Canonicalize every puzzle-set username to lowercase.
-- Safe to run after puzzle_sets.sql. Case-only duplicate sets are merged and
-- every affected puzzle is relinked to the surviving set.

alter table public.puzzle_sets
  add column if not exists source_id text;

drop index if exists public.puzzle_sets_identity_unique;

create or replace function public.normalize_puzzle_set_players(p_players text[])
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(
    array_agg(player order by player),
    '{}'::text[]
  )
  from (
    select distinct lower(btrim(value)) as player
    from unnest(coalesce(p_players, '{}'::text[])) as supplied(value)
    where btrim(value) <> ''
  ) normalized;
$$;

update public.puzzle_sets
set players = public.normalize_puzzle_set_players(players)
where players is distinct from public.normalize_puzzle_set_players(players);

create temporary table puzzle_set_case_merge on commit drop as
select id as duplicate_id,
       min(id) over (
         partition by lower(btrim(event_name)), event_date, players
       ) as keep_id
from public.puzzle_sets;

delete from puzzle_set_case_merge
where duplicate_id = keep_id;

-- Preserve a source match stored on either copy before removing duplicates.
update public.puzzle_sets keep
set source_id = coalesce(
  nullif(btrim(keep.source_id), ''),
  (
    select duplicate.source_id
    from puzzle_set_case_merge merge
    join public.puzzle_sets duplicate on duplicate.id = merge.duplicate_id
    where merge.keep_id = keep.id
      and nullif(btrim(duplicate.source_id), '') is not null
    order by duplicate.id
    limit 1
  )
)
where exists (
  select 1
  from puzzle_set_case_merge merge
  where merge.keep_id = keep.id
);

update public.puzzles puzzle
set puzzle_set_id = merge.keep_id
from puzzle_set_case_merge merge
where puzzle.puzzle_set_id = merge.duplicate_id;

delete from public.puzzle_sets puzzle_set
using puzzle_set_case_merge merge
where puzzle_set.id = merge.duplicate_id;

-- Keep the temporary compatibility columns normalized while they still exist.
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
