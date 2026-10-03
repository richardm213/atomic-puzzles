-- Remove the 3000 puzzle-rating ceiling and retire V6.
-- V grades remain editorial/summary bands; the numeric Glicko rating is now unbounded above.

begin;

create or replace function public.puzzle_level_anchor(p_level smallint)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_level
    when 1 then 1500
    when 2 then 1800
    when 3 then 2100
    when 4 then 2400
    when 5 then 2700
    -- Treat legacy V6 values as V5 during the migration window.
    when 6 then 2700
    else 2100
  end;
$$;

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

CREATE OR REPLACE FUNCTION public.set_human_puzzle_level(p_puzzle_id bigint, p_username text, p_level smallint)
 RETURNS TABLE(puzzle_id bigint, level smallint, rating integer, rating_deviation integer, attempts integer, successes integer, source text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  changed_at timestamptz := now();
begin
  if lower(btrim(p_username)) <> 'seaside_tiramisu' then
    raise exception 'Only seaside_tiramisu can edit puzzle ratings';
  end if;
  if p_level not between 1 and 5 then
    raise exception 'Puzzle level must be between 1 and 5';
  end if;

  insert into public.puzzle_ratings (
    puzzle_id,
    rating,
    rating_deviation,
    computed_level,
    human_level,
    human_rated_by,
    human_rated_at,
    updated_at
  ) values (
    p_puzzle_id,
    public.puzzle_level_anchor(p_level),
    75,
    p_level,
    p_level,
    lower(btrim(p_username)),
    changed_at,
    changed_at
  )
  -- `puzzle_id` is also an output variable because this function returns a
  -- table. Naming the constraint avoids PL/pgSQL treating the conflict target
  -- as an ambiguous reference at runtime.
  on conflict on constraint puzzle_ratings_pkey do update set
    rating = public.puzzle_level_anchor(excluded.human_level),
    rating_deviation = 75,
    computed_level = excluded.human_level,
    human_level = excluded.human_level,
    human_rated_by = excluded.human_rated_by,
    human_rated_at = excluded.human_rated_at,
    updated_at = excluded.updated_at;

  update public.puzzles
  set
    puzzle_level = p_level,
    puzzle_rating = state.rating,
    puzzle_rating_deviation = state.rating_deviation,
    puzzle_rating_attempts = state.attempts,
    puzzle_rating_successes = state.successes,
    puzzle_rating_source = 'human',
    puzzle_rating_updated_at = changed_at
  from public.puzzle_ratings state
  where id = p_puzzle_id
    and state.puzzle_id = p_puzzle_id;

  if not found then
    raise exception 'Puzzle not found';
  end if;

  return query
  select
    state.puzzle_id,
    state.human_level,
    state.rating,
    state.rating_deviation,
    state.attempts,
    state.successes,
    'human'::text,
    state.updated_at
  from public.puzzle_ratings state
  where state.puzzle_id = p_puzzle_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.rate_first_puzzle_attempt_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q constant double precision := ln(10.0) / 400.0;
  normalized_username text := lower(btrim(new.username));
  numeric_puzzle_id bigint := new.puzzle_id::bigint;
  user_rating_value double precision;
  user_rd double precision;
  user_attempts integer;
  user_successes integer;
  puzzle_rating_value double precision;
  puzzle_rd double precision;
  puzzle_attempts integer;
  puzzle_successes integer;
  puzzle_human_level smallint;
  puzzle_computed_level smallint;
  user_g double precision;
  puzzle_g double precision;
  user_expected double precision;
  puzzle_expected double precision;
  user_d2 double precision;
  puzzle_d2 double precision;
  next_user_rating integer;
  next_user_rd integer;
  next_puzzle_rating integer;
  next_puzzle_rd integer;
  next_puzzle_attempts integer;
  next_puzzle_successes integer;
  next_computed_level smallint;
begin
  insert into public.puzzle_ratings (puzzle_id)
  values (numeric_puzzle_id)
  on conflict (puzzle_id) do nothing;

  insert into public.puzzle_user_ratings (username)
  values (normalized_username)
  on conflict (username) do nothing;

  -- Always lock puzzle first, then user, to keep concurrent attempts ordered.
  select rating, rating_deviation, attempts, successes, human_level, computed_level
  into
    puzzle_rating_value,
    puzzle_rd,
    puzzle_attempts,
    puzzle_successes,
    puzzle_human_level,
    puzzle_computed_level
  from public.puzzle_ratings
  where puzzle_id = numeric_puzzle_id
  for update;

  select rating, rating_deviation, attempts, successes
  into user_rating_value, user_rd, user_attempts, user_successes
  from public.puzzle_user_ratings
  where username = normalized_username
  for update;

  user_g := 1.0 / sqrt(1.0 + 3.0 * q * q * puzzle_rd * puzzle_rd / (pi() * pi()));
  puzzle_g := 1.0 / sqrt(1.0 + 3.0 * q * q * user_rd * user_rd / (pi() * pi()));
  user_expected := 1.0 / (
    1.0 + power(10.0, -user_g * (user_rating_value - puzzle_rating_value) / 400.0)
  );
  puzzle_expected := 1.0 / (
    1.0 + power(10.0, -puzzle_g * (puzzle_rating_value - user_rating_value) / 400.0)
  );
  user_d2 := 1.0 / (
    q * q * user_g * user_g * user_expected * (1.0 - user_expected)
  );
  puzzle_d2 := 1.0 / (
    q * q * puzzle_g * puzzle_g * puzzle_expected * (1.0 - puzzle_expected)
  );

  next_user_rd := greatest(
    50,
    least(350, round(sqrt(1.0 / (1.0 / (user_rd * user_rd) + 1.0 / user_d2)))::integer)
  );
  next_user_rating := greatest(
    800,
    least(
      3200,
      round(
        user_rating_value +
        q / (1.0 / (user_rd * user_rd) + 1.0 / user_d2) *
        user_g * ((case when new.puzzle_correct then 1.0 else 0.0 end) - user_expected)
      )::integer
    )
  );
  next_puzzle_rd := greatest(
    50,
    least(350, round(sqrt(1.0 / (1.0 / (puzzle_rd * puzzle_rd) + 1.0 / puzzle_d2)))::integer)
  );
  next_puzzle_rating := greatest(
    800,
      round(
        puzzle_rating_value +
        q / (1.0 / (puzzle_rd * puzzle_rd) + 1.0 / puzzle_d2) *
        puzzle_g * ((case when new.puzzle_correct then 0.0 else 1.0 end) - puzzle_expected)
      )::integer
  );
  next_puzzle_attempts := puzzle_attempts + 1;
  next_puzzle_successes := puzzle_successes + case when new.puzzle_correct then 1 else 0 end;
  next_computed_level := case
    when puzzle_human_level is not null then puzzle_human_level
    when next_puzzle_attempts < 4 then puzzle_computed_level
    else public.puzzle_level_for_rating(
      next_puzzle_rating,
      next_puzzle_attempts,
      next_puzzle_successes
    )
  end;

  update public.puzzle_user_ratings
  set
    rating = next_user_rating,
    rating_deviation = next_user_rd,
    attempts = user_attempts + 1,
    successes = user_successes + case when new.puzzle_correct then 1 else 0 end,
    updated_at = new.first_attempt_at,
    last_attempt_at = new.first_attempt_at
  where username = normalized_username;

  update public.puzzle_ratings
  set
    rating = next_puzzle_rating,
    rating_deviation = next_puzzle_rd,
    attempts = next_puzzle_attempts,
    successes = next_puzzle_successes,
    computed_level = next_computed_level,
    updated_at = new.first_attempt_at
  where puzzle_id = numeric_puzzle_id;

  -- Compatibility cache for the already-deployed v1 client.
  update public.puzzles
  set
    puzzle_rating = next_puzzle_rating,
    puzzle_rating_deviation = next_puzzle_rd,
    puzzle_rating_attempts = next_puzzle_attempts,
    puzzle_rating_successes = next_puzzle_successes,
    puzzle_level = coalesce(puzzle_human_level, next_computed_level),
    puzzle_rating_source = case
      when puzzle_human_level is not null then 'human'
      when next_puzzle_attempts >= 4 then 'ai'
      else 'system'
    end,
    puzzle_rating_updated_at = new.first_attempt_at
  where id = numeric_puzzle_id;

  insert into public.puzzle_rating_events (
    username,
    puzzle_id,
    attempted_at,
    puzzle_correct,
    user_rating_before,
    user_rating_after,
    user_rd_before,
    user_rd_after,
    puzzle_rating_before,
    puzzle_rating_after,
    puzzle_rd_before,
    puzzle_rd_after,
    calculation_kind
  ) values (
    normalized_username,
    numeric_puzzle_id,
    new.first_attempt_at,
    new.puzzle_correct,
    round(user_rating_value)::integer,
    next_user_rating,
    round(user_rd)::integer,
    next_user_rd,
    round(puzzle_rating_value)::integer,
    next_puzzle_rating,
    round(puzzle_rd)::integer,
    next_puzzle_rd,
    'live_glicko'
  )
  on conflict (username, puzzle_id) do nothing;

  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.rebuild_puzzle_ratings_from_history()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  attempt record;
  q constant double precision := ln(10.0) / 400.0;
  user_rating_value double precision;
  user_rd double precision;
  user_attempts integer;
  user_successes integer;
  puzzle_rating_value double precision;
  puzzle_rd double precision;
  puzzle_attempts integer;
  puzzle_successes integer;
  puzzle_human_level smallint;
  puzzle_computed_level smallint;
  puzzle_updated_at timestamptz;
  user_g double precision;
  puzzle_g double precision;
  user_expected double precision;
  puzzle_expected double precision;
  user_d2 double precision;
  puzzle_d2 double precision;
  next_user_rating integer;
  next_user_rd integer;
  next_puzzle_rating integer;
  next_puzzle_rd integer;
  next_puzzle_attempts integer;
  next_puzzle_successes integer;
  next_computed_level smallint;
begin
  delete from public.puzzle_rating_events
  where id is not null;

  update public.puzzle_user_ratings
  set
    rating = 2000,
    rating_deviation = 350,
    attempts = 0,
    successes = 0,
    updated_at = null,
    last_attempt_at = null
  where username is not null;

  -- Put every puzzle at its V anchor before replaying results. Human-graded
  -- puzzles use the selected V. Automatic puzzles estimate a V from the full
  -- first-attempt ledger, then use that V's preset as the starting rating.
  with attempt_counts as (
    select
      progress.puzzle_id::bigint as puzzle_id,
      count(*)::integer as attempts,
      count(*) filter (where progress.puzzle_correct)::integer as successes
    from public.puzzle_progress progress
    group by progress.puzzle_id::bigint
  ), estimates as (
    select
      state.puzzle_id,
      state.computed_level,
      coalesce(history.attempts, 0) as attempts,
      coalesce(history.successes, 0) as successes,
      case
        when coalesce(history.attempts, 0) >= 5
          and coalesce(history.successes, 0) = 0 then 3000
        when coalesce(history.attempts, 0) >= 4 then greatest(
          1500,
          least(
            2700,
            round(
              2000 - 400 * log(
                10,
                ((history.successes + 1.0) / (history.attempts + 2.0)) /
                (1.0 - ((history.successes + 1.0) / (history.attempts + 2.0)))
              )
            )::integer
          )
        )
        else 2100
      end as estimated_rating
    from public.puzzle_ratings state
    left join attempt_counts history on history.puzzle_id = state.puzzle_id
  ), seeds as (
    select
      estimate.*,
      case
        when estimate.attempts < 4 then estimate.computed_level
        else public.puzzle_level_for_rating(
          estimate.estimated_rating,
          estimate.attempts,
          estimate.successes
        )
      end as seed_level
    from estimates estimate
  )
  update public.puzzle_ratings state
  set
    rating = case
      when state.human_level is null then public.puzzle_level_anchor(seed.seed_level)
      else public.puzzle_level_anchor(state.human_level)
    end,
    rating_deviation = case
      when state.human_level is not null then 75
      when seed.attempts >= 4 then 150
      else 300
    end,
    attempts = 0,
    successes = 0,
    computed_level = case
      when state.human_level is null then seed.seed_level
      else state.human_level
    end,
    updated_at = case when state.human_level is null then now() else state.updated_at end
  from seeds seed
  where state.puzzle_id = seed.puzzle_id;

  for attempt in
    select
      lower(btrim(progress.username)) as username,
      progress.puzzle_id::bigint as puzzle_id,
      progress.first_attempt_at as attempted_at,
      progress.puzzle_correct
    from public.puzzle_progress progress
    join public.puzzle_ratings rating on rating.puzzle_id = progress.puzzle_id::bigint
    order by
      progress.first_attempt_at,
      lower(btrim(progress.username)),
      progress.puzzle_id
  loop
    select rating, rating_deviation, attempts, successes
    into user_rating_value, user_rd, user_attempts, user_successes
    from public.puzzle_user_ratings
    where username = attempt.username
    for update;

    select rating, rating_deviation, attempts, successes, human_level, computed_level, updated_at
    into
      puzzle_rating_value,
      puzzle_rd,
      puzzle_attempts,
      puzzle_successes,
      puzzle_human_level,
      puzzle_computed_level,
      puzzle_updated_at
    from public.puzzle_ratings
    where puzzle_id = attempt.puzzle_id
    for update;

    user_g := 1.0 / sqrt(
      1.0 + 3.0 * q * q * puzzle_rd * puzzle_rd / (pi() * pi())
    );
    puzzle_g := 1.0 / sqrt(
      1.0 + 3.0 * q * q * user_rd * user_rd / (pi() * pi())
    );
    user_expected := 1.0 / (
      1.0 + power(10.0, -user_g * (user_rating_value - puzzle_rating_value) / 400.0)
    );
    puzzle_expected := 1.0 / (
      1.0 + power(10.0, -puzzle_g * (puzzle_rating_value - user_rating_value) / 400.0)
    );
    user_d2 := 1.0 / (
      q * q * user_g * user_g * user_expected * (1.0 - user_expected)
    );
    puzzle_d2 := 1.0 / (
      q * q * puzzle_g * puzzle_g * puzzle_expected * (1.0 - puzzle_expected)
    );
    next_user_rd := greatest(
      50,
      least(
        350,
        round(sqrt(1.0 / (1.0 / (user_rd * user_rd) + 1.0 / user_d2)))::integer
      )
    );
    next_user_rating := greatest(
      800,
      least(
        3200,
        round(
          user_rating_value +
          q / (1.0 / (user_rd * user_rd) + 1.0 / user_d2) *
          user_g * ((case when attempt.puzzle_correct then 1.0 else 0.0 end) - user_expected)
        )::integer
      )
    );
    next_puzzle_rd := greatest(
      50,
      least(
        350,
        round(sqrt(1.0 / (1.0 / (puzzle_rd * puzzle_rd) + 1.0 / puzzle_d2)))::integer
      )
    );
    next_puzzle_rating := greatest(
      800,
        round(
          puzzle_rating_value +
          q / (1.0 / (puzzle_rd * puzzle_rd) + 1.0 / puzzle_d2) *
          puzzle_g * ((case when attempt.puzzle_correct then 0.0 else 1.0 end) - puzzle_expected)
        )::integer
    );
    next_puzzle_attempts := puzzle_attempts + 1;
    next_puzzle_successes := puzzle_successes + case when attempt.puzzle_correct then 1 else 0 end;
    next_computed_level := case
      when puzzle_human_level is not null then puzzle_human_level
      when next_puzzle_attempts < 4 then puzzle_computed_level
      else public.puzzle_level_for_rating(
        next_puzzle_rating,
        next_puzzle_attempts,
        next_puzzle_successes
      )
    end;

    update public.puzzle_user_ratings
    set
      rating = next_user_rating,
      rating_deviation = next_user_rd,
      attempts = user_attempts + 1,
      successes = user_successes + case when attempt.puzzle_correct then 1 else 0 end,
      updated_at = attempt.attempted_at,
      last_attempt_at = attempt.attempted_at
    where username = attempt.username;

    update public.puzzle_ratings
    set
      rating = next_puzzle_rating,
      rating_deviation = next_puzzle_rd,
      attempts = next_puzzle_attempts,
      successes = next_puzzle_successes,
      computed_level = next_computed_level,
      updated_at = case
        when puzzle_human_level is null then attempt.attempted_at
        else greatest(puzzle_updated_at, attempt.attempted_at)
      end
    where puzzle_id = attempt.puzzle_id;

    insert into public.puzzle_rating_events (
      username,
      puzzle_id,
      attempted_at,
      puzzle_correct,
      user_rating_before,
      user_rating_after,
      user_rd_before,
      user_rd_after,
      puzzle_rating_before,
      puzzle_rating_after,
      puzzle_rd_before,
      puzzle_rd_after,
      calculation_kind
    ) values (
      attempt.username,
      attempt.puzzle_id,
      attempt.attempted_at,
      attempt.puzzle_correct,
      round(user_rating_value)::integer,
      next_user_rating,
      round(user_rd)::integer,
      next_user_rd,
      round(puzzle_rating_value)::integer,
      next_puzzle_rating,
      round(puzzle_rd)::integer,
      next_puzzle_rd,
      'historical_backfill'
    );
  end loop;

  -- Refresh the v1 compatibility columns from the completed canonical replay.
  update public.puzzles puzzle
  set
    puzzle_rating = state.rating,
    puzzle_rating_deviation = state.rating_deviation,
    puzzle_rating_attempts = state.attempts,
    puzzle_rating_successes = state.successes,
    puzzle_level = coalesce(state.human_level, state.computed_level),
    puzzle_rating_source = case
      when state.human_level is not null then 'human'
      when state.attempts >= 4 then 'ai'
      else 'system'
    end,
    puzzle_rating_updated_at = state.updated_at
  from public.puzzle_ratings state
  where puzzle.id = state.puzzle_id;
end;
$function$


-- Normalize any legacy manual or computed V6 state before replaying history.
update public.puzzle_ratings
set
  human_level = case when human_level = 6 then 5 else human_level end,
  computed_level = case when computed_level = 6 then 5 else computed_level end
where human_level = 6 or computed_level = 6;

update public.puzzles
set puzzle_level = 5
where puzzle_level = 6;

select public.rebuild_puzzle_ratings_from_history();

commit;
