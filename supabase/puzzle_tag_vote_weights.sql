begin;

-- Votes store direction, not weight. Updating this function also reweights past votes.
create or replace function public.puzzle_tag_vote_weight(p_voter text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_voter in (
    'seaside_tiramisu', 'wolfram_ep', 'randoomplayer', 'opabinia', 'rechesster',
    'sircachetes', 'thuban'
  ) then 3 else 1 end;
$$;

-- Keep the stored visible tags in sync with the reweighted tallies.
with affected as materialized (
  select p.id, p.tags
  from public.puzzles p
  where p.deleted_at is null
    and exists (
      select 1 from public.puzzle_tag_votes v
      where v.puzzle_id = p.id and v.voter in ('sircachetes', 'thuban')
    )
  order by p.id
  for no key update of p
), updated as (
  select id, public.visible_puzzle_tag_votes(id, tags) as tags
  from affected
)
update public.puzzles p
set tags = u.tags
from updated u
where p.id = u.id and p.tags is distinct from u.tags;

commit;
