-- Restore the original automatic puzzle-level rating bands:
-- V1 < 1625, V2 1625-1874, V3 1875-2124,
-- V4 2125-2374, and V5 >= 2375.
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
    when p_rating >= 2375 then 5
    when p_rating >= 2125 then 4
    when p_rating >= 1875 then 3
    when p_rating >= 1625 then 2
    else 1
  end::smallint;
$$;

insert into public.puzzle_ratings (puzzle_id)
select puzzle.id
from public.puzzles puzzle
on conflict (puzzle_id) do nothing;

update public.puzzle_ratings
set computed_level = public.puzzle_level_for_rating(rating, attempts, successes)
where human_level is null
  and computed_level is distinct from public.puzzle_level_for_rating(rating, attempts, successes);

update public.puzzles puzzle
set puzzle_level = coalesce(rating.human_level, rating.computed_level)
from public.puzzle_ratings rating
where puzzle.id = rating.puzzle_id
  and puzzle.puzzle_level is distinct from coalesce(rating.human_level, rating.computed_level);

commit;
