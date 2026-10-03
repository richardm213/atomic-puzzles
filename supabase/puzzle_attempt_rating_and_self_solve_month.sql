-- Mark first attempts as rated or unrated and use a rolling one-month creator cooldown.
-- A creator's own attempts during that window remain in progress/history, but they
-- do not change puzzle ratings, solver ratings, or coin balances.
begin;

-- Keep full-precision Glicko uncertainty internally. The integer RD columns
-- remain the stable public/API representation and are rounded only on write.
alter table public.puzzle_user_ratings
  add column if not exists rating_deviation_precise double precision;
update public.puzzle_user_ratings
set rating_deviation_precise = rating_deviation
where rating_deviation_precise is null;
alter table public.puzzle_user_ratings
  alter column rating_deviation_precise set default 350,
  alter column rating_deviation_precise set not null;
alter table public.puzzle_user_ratings
  drop constraint if exists puzzle_user_ratings_rating_deviation_check,
  add constraint puzzle_user_ratings_rating_deviation_check
    check (rating_deviation between 45 and 350),
  drop constraint if exists puzzle_user_ratings_precise_deviation_check,
  add constraint puzzle_user_ratings_precise_deviation_check
    check (rating_deviation_precise between 45 and 350);

alter table public.puzzle_ratings
  add column if not exists rating_deviation_precise double precision;
update public.puzzle_ratings
set rating_deviation_precise = rating_deviation
where rating_deviation_precise is null;
alter table public.puzzle_ratings
  alter column rating_deviation_precise set default 300,
  alter column rating_deviation_precise set not null;
alter table public.puzzle_ratings
  drop constraint if exists puzzle_ratings_rating_deviation_check,
  add constraint puzzle_ratings_rating_deviation_check
    check (rating_deviation between 45 and 350),
  drop constraint if exists puzzle_ratings_precise_deviation_check,
  add constraint puzzle_ratings_precise_deviation_check
    check (rating_deviation_precise between 45 and 350);

alter table public.puzzle_progress
  add column if not exists rated boolean not null default true;

comment on column public.puzzle_progress.rated is
  'Whether this first attempt affects solver and puzzle ratings.';

grant select (rated) on table public.puzzle_progress to anon, authenticated;

create or replace function public.award_coins_for_puzzle_attempt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  coin_delta integer;
  puzzle_author text;
  puzzle_created_at timestamptz;
  puzzle_level smallint;
  current_balance integer;
  transaction_id bigint;
begin
  -- Economy-banned players can still submit puzzles without any coin mutation.
  if not new.rated or public.is_coin_economy_banned(new.username) then
    return new;
  end if;

  select
    lower(btrim(puzzle.author)),
    puzzle.created_at,
    coalesce(rating.human_level, rating.computed_level, 3)
  into puzzle_author, puzzle_created_at, puzzle_level
  from public.puzzles puzzle
  left join public.puzzle_ratings rating on rating.puzzle_id = puzzle.id
  where puzzle.id::text = new.puzzle_id;

  if new.puzzle_correct then
    -- Do not reward creators for solving a newly published puzzle of their own.
    if puzzle_author = lower(btrim(new.username))
      and new.first_attempt_at >= puzzle_created_at
      and new.first_attempt_at < puzzle_created_at + interval '1 month' then
      return new;
    end if;

    coin_delta := case puzzle_level
      when 1 then 2
      when 2 then 2
      when 4 then 5
      when 5 then 10
      else 3
    end;

    perform public.apply_coin_transaction(
      new.username,
      coin_delta,
      'puzzle_correct',
      'attempt:' || lower(btrim(new.username)) || ':' || new.puzzle_id,
      jsonb_build_object(
        'puzzleId', new.puzzle_id,
        'correct', true,
        'level', puzzle_level,
        'reward', coin_delta
      ),
      new.first_attempt_at
    );
    return new;
  end if;

  coin_delta := case puzzle_level
    when 1 then -2
    when 2 then -2
    when 3 then -1
    else 0
  end;

  if coin_delta = 0 then
    return new;
  end if;

  insert into public.coin_accounts (username)
  values (lower(btrim(new.username)))
  on conflict (username) do nothing;

  select account.balance
  into current_balance
  from public.coin_accounts account
  where account.username = lower(btrim(new.username))
  for update;

  -- Keep balances nonnegative and do not write zero-value transactions.
  coin_delta := -least(abs(coin_delta), current_balance);
  if coin_delta = 0 then
    return new;
  end if;

  insert into public.coin_transactions (
    username,
    amount,
    reason,
    source_key,
    metadata,
    created_at
  ) values (
    lower(btrim(new.username)),
    coin_delta,
    'puzzle_attempted',
    'attempt:' || lower(btrim(new.username)) || ':' || new.puzzle_id,
    jsonb_build_object(
      'puzzleId', new.puzzle_id,
      'correct', false,
      'level', puzzle_level,
      'penalty', abs(coin_delta)
    ),
    new.first_attempt_at
  )
  on conflict (source_key) do nothing
  returning id into transaction_id;

  if transaction_id is not null then
    update public.coin_accounts
    set balance = balance + coin_delta, updated_at = now()
    where username = lower(btrim(new.username));
  end if;

  return new;
end;
$$;

create or replace function public.record_first_puzzle_attempt_v2(
  p_username text,
  p_puzzle_id text,
  p_puzzle_correct boolean,
  p_attempt_duration_ms integer,
  p_incorrect_move text,
  p_correct_move text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_username text := public.canonical_user_username(p_username);
  normalized_puzzle_id text := btrim(p_puzzle_id);
  coin_delta integer := 0;
  attempt_at timestamptz := now();
  attempt_is_rated boolean := true;
  previous_attempt_at timestamptz;
  previous_attempt_rated boolean;
  has_previous_attempt boolean := false;
begin
  if nullif(normalized_username, '') is null then
    raise exception 'Username is required';
  end if;

  if nullif(normalized_puzzle_id, '') is null then
    raise exception 'Puzzle ID is required';
  end if;

  -- Serialize attempts for one solver/puzzle even when no row exists yet.
  perform pg_advisory_xact_lock(
    hashtextextended(normalized_username || ':' || normalized_puzzle_id, 0)
  );

  select progress.first_attempt_at, progress.rated
  into previous_attempt_at, previous_attempt_rated
  from public.puzzle_progress progress
  where progress.username = normalized_username
    and progress.puzzle_id = normalized_puzzle_id
  for update;
  has_previous_attempt := found;

  if has_previous_attempt and previous_attempt_rated then
    return 0;
  end if;

  if has_previous_attempt then
    -- Every early retry replaces the prior unrated row and restarts the month.
    attempt_is_rated := attempt_at >= previous_attempt_at + interval '1 month';
  else
    -- The creator's first attempt is unrated during the month after publication.
    select not (
      lower(btrim(puzzle.author)) = normalized_username
      and attempt_at >= puzzle.created_at
      and attempt_at < puzzle.created_at + interval '1 month'
    )
    into attempt_is_rated
    from public.puzzles puzzle
    where puzzle.id::text = normalized_puzzle_id;

    attempt_is_rated := coalesce(attempt_is_rated, true);
  end if;

  if has_previous_attempt then
    update public.puzzle_progress
    set
      first_attempt_at = attempt_at,
      first_attempt_duration_ms = case
        when p_attempt_duration_ms >= 0 and p_attempt_duration_ms < 3600000
          then p_attempt_duration_ms
        else null
      end,
      puzzle_correct = p_puzzle_correct,
      rated = attempt_is_rated,
      incorrect_move = case
        when p_puzzle_correct then null
        else nullif(left(btrim(coalesce(p_incorrect_move, '')), 100), '')
      end,
      correct_move = case
        when p_puzzle_correct
          then nullif(left(btrim(coalesce(p_correct_move, '')), 100), '')
        else null
      end
    where username = normalized_username
      and puzzle_id = normalized_puzzle_id
      and not rated;
  else
    insert into public.puzzle_progress (
      username,
      puzzle_id,
      first_attempt_at,
      first_attempt_duration_ms,
      puzzle_correct,
      rated,
      incorrect_move,
      correct_move
    )
    values (
      normalized_username,
      normalized_puzzle_id,
      attempt_at,
      case
        when p_attempt_duration_ms >= 0 and p_attempt_duration_ms < 3600000
          then p_attempt_duration_ms
        else null
      end,
      p_puzzle_correct,
      attempt_is_rated,
      case
        when p_puzzle_correct then null
        else nullif(left(btrim(coalesce(p_incorrect_move, '')), 100), '')
      end,
      case
        when p_puzzle_correct
          then nullif(left(btrim(coalesce(p_correct_move, '')), 100), '')
        else null
      end
    );
  end if;

  select coalesce((
    select transaction.amount
    from public.coin_transactions transaction
    where transaction.source_key =
      'attempt:' || normalized_username || ':' || normalized_puzzle_id
  ), 0)
  into coin_delta;

  return coin_delta;
end;
$$;

revoke all on function public.record_first_puzzle_attempt_v2(
  text,
  text,
  boolean,
  integer,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.record_first_puzzle_attempt_v2(
  text,
  text,
  boolean,
  integer,
  text,
  text
) to service_role;

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
  next_user_rd double precision;
  next_puzzle_rating integer;
  next_puzzle_rd double precision;
  next_puzzle_attempts integer;
  next_puzzle_successes integer;
  next_computed_level smallint;
begin
  if not new.rated then
    return new;
  end if;

  insert into public.puzzle_ratings (puzzle_id)
  values (numeric_puzzle_id)
  on conflict (puzzle_id) do nothing;

  insert into public.puzzle_user_ratings (username)
  values (normalized_username)
  on conflict (username) do nothing;

  -- Always lock puzzle first, then user, to keep concurrent attempts ordered.
  select rating, rating_deviation_precise, attempts, successes, human_level, computed_level
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

  select rating, rating_deviation_precise, attempts, successes
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
    45,
    least(350, sqrt(1.0 / (1.0 / (user_rd * user_rd) + 1.0 / user_d2)))
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
    45,
    least(350, sqrt(1.0 / (1.0 / (puzzle_rd * puzzle_rd) + 1.0 / puzzle_d2)))
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
    rating_deviation = round(next_user_rd)::integer,
    rating_deviation_precise = next_user_rd,
    attempts = user_attempts + 1,
    successes = user_successes + case when new.puzzle_correct then 1 else 0 end,
    updated_at = new.first_attempt_at,
    last_attempt_at = new.first_attempt_at
  where username = normalized_username;

  update public.puzzle_ratings
  set
    rating = next_puzzle_rating,
    rating_deviation = round(next_puzzle_rd)::integer,
    rating_deviation_precise = next_puzzle_rd,
    attempts = next_puzzle_attempts,
    successes = next_puzzle_successes,
    computed_level = next_computed_level,
    updated_at = new.first_attempt_at
  where puzzle_id = numeric_puzzle_id;

  -- Compatibility cache for the already-deployed v1 client.
  update public.puzzles
  set
    puzzle_rating = next_puzzle_rating,
    puzzle_rating_deviation = round(next_puzzle_rd)::integer,
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
    round(next_user_rd)::integer,
    round(puzzle_rating_value)::integer,
    next_puzzle_rating,
    round(puzzle_rd)::integer,
    round(next_puzzle_rd)::integer,
    'live_glicko'
  )
  on conflict (username, puzzle_id) do nothing;

  return new;
end;
$function$;

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
  next_user_rd double precision;
  next_puzzle_rating integer;
  next_puzzle_rd double precision;
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
    rating_deviation_precise = 350,
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
    where progress.rated
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
        when estimate.attempts < 4 then 3
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
    rating_deviation_precise = case
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
    where progress.rated
    order by
      progress.first_attempt_at,
      lower(btrim(progress.username)),
      progress.puzzle_id
  loop
    select rating, rating_deviation_precise, attempts, successes
    into user_rating_value, user_rd, user_attempts, user_successes
    from public.puzzle_user_ratings
    where username = attempt.username
    for update;

    select rating, rating_deviation_precise, attempts, successes, human_level, computed_level, updated_at
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
      45,
      least(
        350,
        sqrt(1.0 / (1.0 / (user_rd * user_rd) + 1.0 / user_d2))
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
      45,
      least(
        350,
        sqrt(1.0 / (1.0 / (puzzle_rd * puzzle_rd) + 1.0 / puzzle_d2))
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
      rating_deviation = round(next_user_rd)::integer,
      rating_deviation_precise = next_user_rd,
      attempts = user_attempts + 1,
      successes = user_successes + case when attempt.puzzle_correct then 1 else 0 end,
      updated_at = attempt.attempted_at,
      last_attempt_at = attempt.attempted_at
    where username = attempt.username;

    update public.puzzle_ratings
    set
      rating = next_puzzle_rating,
      rating_deviation = round(next_puzzle_rd)::integer,
      rating_deviation_precise = next_puzzle_rd,
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
      round(next_user_rd)::integer,
      round(puzzle_rating_value)::integer,
      next_puzzle_rating,
      round(puzzle_rd)::integer,
      round(next_puzzle_rd)::integer,
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
$function$;

-- Replacing an unrated row with a rated attempt must run the same ledgers as a new row.
drop trigger if exists award_coins_after_puzzle_attempt on public.puzzle_progress;
create trigger award_coins_after_puzzle_attempt
  after insert or update of rated on public.puzzle_progress
  for each row
  when (new.rated)
  execute function public.award_coins_for_puzzle_attempt();

do $$
declare
  existing_trigger record;
begin
  for existing_trigger in
    select candidate.tgname
    from pg_trigger candidate
    where candidate.tgrelid = 'public.puzzle_progress'::regclass
      and candidate.tgfoid = 'public.rate_first_puzzle_attempt_v2()'::regprocedure
      and not candidate.tgisinternal
  loop
    execute format('drop trigger %I on public.puzzle_progress', existing_trigger.tgname);
  end loop;
end;
$$;

create trigger rate_puzzle_after_first_attempt
  after insert or update of rated on public.puzzle_progress
  for each row
  when (new.rated)
  execute function public.rate_first_puzzle_attempt_v2();

create or replace function public.get_puzzle_progress_page_v2(
  p_username text,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  puzzle_id text,
  first_attempt_at timestamptz,
  puzzle_correct boolean,
  rated boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    progress.puzzle_id,
    progress.first_attempt_at,
    progress.puzzle_correct,
    progress.rated,
    count(*) over () as total_count
  from public.puzzle_progress progress
  where progress.username = lower(btrim(p_username))
  order by progress.first_attempt_at desc, progress.puzzle_id
  limit least(1000, greatest(1, coalesce(p_page_size, 20)))
  offset (greatest(1, coalesce(p_page, 1)) - 1)
    * least(1000, greatest(1, coalesce(p_page_size, 20)));
$$;

revoke all on function public.get_puzzle_progress_page_v2(text, integer, integer)
  from public;
grant execute on function public.get_puzzle_progress_page_v2(text, integer, integer)
  to anon, authenticated, service_role;

create or replace function public.get_rated_puzzle_ids(p_username text)
returns table (puzzle_id text)
language sql
stable
security definer
set search_path = public
as $$
  select progress.puzzle_id
  from public.puzzle_progress progress
  where progress.username = lower(btrim(p_username))
    and progress.rated
  order by progress.puzzle_id;
$$;

revoke all on function public.get_rated_puzzle_ids(text) from public;
grant execute on function public.get_rated_puzzle_ids(text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;

select jsonb_build_object(
  'rated_column_installed', exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'puzzle_progress'
      and column_name = 'rated'
  ),
  'creator_cooldown', '1 month',
  'progress_page_rpc', 'get_puzzle_progress_page_v2'
) as migration_result;
