-- Align automatic V-grade boundaries with the midpoints between the
-- 1500, 1800, 2100, 2400, and 2700 initial rating anchors.
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
    when p_rating >= 2550 then 5
    when p_rating >= 2250 then 4
    when p_rating >= 1950 then 3
    when p_rating >= 1650 then 2
    else 1
  end::smallint;
$$;

-- Reclassify only confirmed automatic grades. Provisional and human grades
-- retain their current treatment until a rating refresh or manual edit.
update public.puzzle_ratings
set computed_level = public.puzzle_level_for_rating(rating, attempts, successes)
where human_level is null
  and attempts >= 4
  and computed_level is distinct from public.puzzle_level_for_rating(
    rating,
    attempts,
    successes
  );

update public.puzzles puzzle
set puzzle_level = rating.computed_level
from public.puzzle_ratings rating
where puzzle.id = rating.puzzle_id
  and rating.human_level is null
  and rating.attempts >= 4
  and puzzle.puzzle_level is distinct from rating.computed_level;

commit;
