-- Align automatic puzzle levels with the compromise rating bands:
-- V1 < 1650, V2 1650-1924, V3 1925-2199,
-- V4 2200-2474, and V5 >= 2475.
-- Human-assigned levels remain unchanged.
begin;

create or replace function public.puzzle_level_for_rating(
  p_rating double precision,
  p_attempts integer,
  p_successes integer
)
returns smallint
language sql
immutable
set search_path = public
as $$
  select case
    when p_rating >= 2475 then 5
    when p_rating >= 2200 then 4
    when p_rating >= 1925 then 3
    when p_rating >= 1650 then 2
    else 1
  end::smallint;
$$;

-- New puzzles normally receive their rating row on first attempt. Seed any
-- that have not been attempted yet so the full catalog is updated now.
insert into public.puzzle_ratings (puzzle_id)
select puzzle.id
from public.puzzles puzzle
on conflict (puzzle_id) do nothing;

update public.puzzle_ratings
set computed_level = public.puzzle_level_for_rating(rating, attempts, successes)
where human_level is null
  and computed_level is distinct from public.puzzle_level_for_rating(rating, attempts, successes);

-- Keep the compatibility cache used by older clients in sync.
update public.puzzles puzzle
set puzzle_level = coalesce(rating.human_level, rating.computed_level)
from public.puzzle_ratings rating
where puzzle.id = rating.puzzle_id
  and puzzle.puzzle_level is distinct from coalesce(rating.human_level, rating.computed_level);

commit;
