-- Consolidate every NeverOFzero chapter into one canonical puzzle set while
-- preserving the original chapter label in puzzles.event.

do $$
declare
  canonical_name constant text := 'NeverOFzero''s Puzzles';
  canonical_id bigint;
begin
  select id
  into canonical_id
  from public.puzzle_sets
  where lower(btrim(event_name)) = lower(canonical_name)
  order by id
  limit 1;

  if canonical_id is null then
    select id
    into canonical_id
    from public.puzzle_sets
    where lower(btrim(event_name)) like 'neverofzero''s puzzles%'
    order by id
    limit 1;
  end if;

  if canonical_id is null then
    insert into public.puzzle_sets (event_name, event_date, players)
    values (canonical_name, '', '{}'::text[])
    returning id into canonical_id;
  else
    update public.puzzle_sets
    set event_name = canonical_name,
        event_date = '',
        players = '{}'::text[]
    where id = canonical_id;
  end if;

  update public.puzzles puzzle
  set puzzle_set_id = canonical_id,
      event_name = canonical_name,
      event_date = '',
      players = '{}'::text[]
  where puzzle.puzzle_set_id in (
    select id
    from public.puzzle_sets
    where lower(btrim(event_name)) like 'neverofzero''s puzzles%'
  );

  update public.puzzles_queue
  set event_name = canonical_name,
      event_date = '',
      players = '{}'::text[]
  where lower(btrim(event_name)) like 'neverofzero''s puzzles%';

  delete from public.puzzle_sets
  where lower(btrim(event_name)) like 'neverofzero''s puzzles%'
    and id <> canonical_id;
end;
$$;

notify pgrst, 'reload schema';
